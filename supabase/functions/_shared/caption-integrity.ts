const HANDLE_RE = /@([a-z0-9._]{1,30})/gi;
const HANDLE_TOKEN_RE = /@[a-z0-9._]{1,30}/i;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const SOURCE_LINE_RE =
  /^(?:fonte|source|via|cr[eé]ditos?(?:\s+(?:da|de)\s+(?:imagem|foto))?|imagem(?:\s+retirada)?\s+de|foto(?:\s+retirada)?\s+de|not[ií]cia(?:\s+retirada)?\s+de)\s*[:\-–—].*$/i;
const CTA_START_RE =
  /^(?:siga|segue|seguir|acompanhe|acompanhar|comente|comenta|salve|salva|compartilhe|compartilha|curta|marque|envie|mande|acesse|visite|confira|qual\s+[ée]\s+a\s+sua\s+opini[aã]o|o\s+que\s+voc[eê]\s+(?:acha|achou|pensa))/i;
const CTA_ANYWHERE_RE =
  /\b(?:siga|segue|acompanhe|comente|comenta|conte|deixe|participe|salve|salva|compartilhe|compartilha|curta|marque|envie|mande)\b/i;

function normalizeWhitespace(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripLeadingDecorators(value: string): string {
  return value
    .replace(/^[\s"'“”‘’()[\]{}:;,.!?\-–—👉💬💾🔁📌]+/u, "")
    .trim();
}

function stripSourceDisclosure(value: string): string {
  const withoutSourceLines = value
    .split("\n")
    .filter((line) => !SOURCE_LINE_RE.test(line.trim()))
    .join("\n");

  return withoutSourceLines
    .replace(
      /\b(?:segundo|de acordo com)\s+(?:o|a)?\s*(?:portal|site|fonte|jornal|revista|ag[eê]ncia)\s+[^,.;:]+[,;:]\s*/giu,
      "",
    )
    .replace(
      /\b(?:imagem|foto|not[ií]cia|conte[uú]do)\s+(?:foi\s+)?(?:retirad[ao]|extra[ií]d[ao]|obtid[ao])\s+(?:do|da|de)\s+[^.!?\n]+[.!?]?/giu,
      "",
    )
    .replace(URL_RE, "");
}

function stripCallsAndHandles(value: string): string {
  const paragraphs = value.split(/\n{2,}/).map((paragraph) => {
    const withoutInstruction = paragraph.replace(
      /\b(?:fechar|finalizar|terminar)\s+(?:a\s+legenda\s+)?(?:convidando|com)\s+(?:para|pra)\s+(?:a\s+)?a[cç][aã]o\b[\s\S]*$/iu,
      "",
    );
    const plainParagraph = stripLeadingDecorators(withoutInstruction);
    if (
      HANDLE_TOKEN_RE.test(withoutInstruction) &&
      (CTA_START_RE.test(plainParagraph) || CTA_ANYWHERE_RE.test(withoutInstruction))
    ) {
      return "";
    }
    const sentences = withoutInstruction.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    const kept = sentences.flatMap((sentence) => {
      const plain = stripLeadingDecorators(sentence);
      const hasHandle = HANDLE_TOKEN_RE.test(sentence);
      if (CTA_START_RE.test(plain) || (hasHandle && CTA_ANYWHERE_RE.test(sentence))) return [];
      const withoutHandle = sentence.replace(HANDLE_RE, "$1");
      return withoutHandle.trim() ? [withoutHandle.trim()] : [];
    });
    return kept.join(" ").trim();
  });
  return paragraphs.filter(Boolean).join("\n\n");
}

function trimAtBoundary(value: string, limit: number): string {
  const clean = normalizeWhitespace(value);
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, Math.max(0, limit - 1));
  const paragraphBreak = cut.lastIndexOf("\n\n");
  const sentenceBreak = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
  );
  const safeCut = Math.max(
    paragraphBreak > limit * 0.6 ? paragraphBreak : 0,
    sentenceBreak > limit * 0.6 ? sentenceBreak + 1 : 0,
  );
  return (safeCut ? cut.slice(0, safeCut) : cut).trim();
}

function normalizeComparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function stableListIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function dedupeEditorialText(value: string, seenSentences: Set<string>): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => {
      const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
      return sentences
        .filter((sentence) => {
          const key = normalizeComparable(stripLeadingDecorators(sentence));
          if (!key || seenSentences.has(key)) return false;
          seenSentences.add(key);
          return true;
        })
        .map((sentence) => sentence.trim())
        .join(" ");
    })
    .filter(Boolean)
    .join("\n\n");
}

function safeDirectQuestion(value: string): string {
  const question = value.match(/(?:^|[.!]\s+)([^.!?]{12,180}\?)/u)?.[1] || "";
  return question
    .replace(HANDLE_RE, "")
    .replace(URL_RE, "")
    .replace(/[?]+$/u, "")
    .trim();
}

function engagementQuestion(style: string, seed: string): string {
  const normalizedStyle = normalizeComparable(style);
  const directQuestion = safeDirectQuestion(style);
  const tailored = directQuestion
    ? [directQuestion]
    : normalizedStyle.includes("duvida")
      ? [
        "Qual dúvida sobre este assunto você quer ver respondida",
        "Que pergunta essa informação deixou para você",
        "Qual ponto você gostaria de entender melhor",
        "O que ainda precisa ser esclarecido sobre esse tema",
      ]
      : normalizedStyle.includes("surpreend") || normalizedStyle.includes("babado")
        ? [
          "O que mais surpreendeu você nesta notícia",
          "Qual detalhe dessa história mais chamou sua atenção",
          "Que parte dessa informação teve mais impacto para você",
          "O que você não esperava encontrar nessa notícia",
        ]
        : normalizedStyle.includes("aplica") || normalizedStyle.includes("pratica")
          ? [
            "Como você aplicaria essa informação na prática",
            "Qual ação prática você tomaria primeiro",
            "O que você colocaria em prática a partir disso",
            "Que mudança concreta você faria agora",
          ]
          : normalizedStyle.includes("consequencia") || normalizedStyle.includes("reflet")
            ? [
              "Que consequência desta notícia merece mais atenção",
              "Qual impacto você considera mais importante",
              "O que essa mudança pode provocar na prática",
              "Como isso pode afetar os próximos acontecimentos",
            ]
            : normalizedStyle.includes("opiniao") || normalizedStyle.includes("acha") ||
                normalizedStyle.includes("pensa")
              ? [
                "Qual é a sua opinião sobre esta notícia",
                "Como você enxerga essa situação",
                "Você concorda com essa leitura",
                "O que você pensa sobre esse cenário",
              ]
              : [];
  const defaults = [
    "Qual ponto desta notícia mais chamou sua atenção",
    "Como você avalia essa informação",
    "O que pode mudar a partir desta notícia",
    "Que consequência desse fato merece mais atenção",
  ];
  const choices = tailored.length ? tailored : defaults;
  return choices[stableListIndex(seed, choices.length)];
}

function engagementCta(accountHandle: string, style: string, seed: string): string {
  const question = engagementQuestion(style, seed);
  const actions = [
    `Conte nos comentários e siga @${accountHandle} para acompanhar os próximos destaques`,
    `Deixe sua opinião e acompanhe @${accountHandle} para receber as próximas notícias`,
    `Participe da conversa e siga @${accountHandle} para não perder as próximas atualizações`,
    `Comente e acompanhe @${accountHandle} para ver os próximos destaques`,
  ];
  const action = actions[stableListIndex(`${seed}:action`, actions.length)];
  return `💬 ${action}: ${question}?`;
}

export function normalizeInstagramHandle(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 30);
}

export function captionHandles(value: unknown): string[] {
  const matches = String(value || "").matchAll(HANDLE_RE);
  return Array.from(matches, (match) => normalizeInstagramHandle(match[1])).filter(Boolean);
}

export function sanitizeEditorialCaptionBody(value: unknown): string {
  const clean = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  return normalizeWhitespace(stripCallsAndHandles(stripSourceDisclosure(clean)));
}

export type FinalizeEditorialCaptionOptions = {
  accountHandle: string;
  signatureBlocks?: string[];
  ctaStyle?: string;
  variationSeed?: string;
  hashtagsLine?: string;
  maxLength?: number;
};

export function finalizeEditorialCaption(
  body: unknown,
  options: FinalizeEditorialCaptionOptions,
): string {
  const accountHandle = normalizeInstagramHandle(options.accountHandle);
  if (!accountHandle) {
    throw new Error("Identidade Instagram indisponível para finalizar a legenda");
  }

  const rawBody = String(body || "");
  const hashtagCandidates = [
    ...(rawBody.match(HASHTAG_RE) || []),
    ...(String(options.hashtagsLine || "").match(HASHTAG_RE) || []),
  ];
  const hashtags = Array.from(new Set(
    hashtagCandidates.map((tag) => tag.toLocaleLowerCase("pt-BR")),
  )).slice(0, 8);

  const bodyWithoutHashtags = rawBody.replace(HASHTAG_RE, " ");
  const blocks = [
    sanitizeEditorialCaptionBody(bodyWithoutHashtags),
    ...(options.signatureBlocks || []).map(sanitizeEditorialCaptionBody),
  ].filter(Boolean);
  const seenSentences = new Set<string>();
  const uniqueBlocks = blocks
    .map((block) => dedupeEditorialText(block, seenSentences))
    .filter(Boolean);

  const variationSeed = `${accountHandle}:${options.variationSeed || normalizeComparable(rawBody).slice(0, 160)}`;
  const cta = engagementCta(accountHandle, String(options.ctaStyle || ""), variationSeed);
  const hashtagBlock = hashtags.join(" ");
  const suffix = [cta, hashtagBlock].filter(Boolean).join("\n\n");
  const maxLength = Math.max(320, options.maxLength || 1700);
  const bodyLimit = Math.max(180, maxLength - suffix.length - 4);
  const result = normalizeWhitespace([
    trimAtBoundary(uniqueBlocks.join("\n\n"), bodyLimit),
    suffix,
  ].filter(Boolean).join("\n\n"));

  const handles = captionHandles(result);
  if (handles.length !== 1 || handles[0] !== accountHandle) {
    throw new Error("Falha ao garantir a identidade única da legenda");
  }
  return result;
}
