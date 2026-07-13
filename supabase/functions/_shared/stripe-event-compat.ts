type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function readString(record: UnknownRecord | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(record: UnknownRecord | null, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readExpandableId(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return readString(asRecord(value), "id");
}

function firstRecord(value: unknown): UnknownRecord | null {
  return Array.isArray(value) ? asRecord(value[0]) : null;
}

export function getSubscriptionPeriod(subscription: unknown): {
  periodStart?: number;
  periodEnd?: number;
} {
  const root = asRecord(subscription);
  const items = asRecord(root?.items);
  const item = firstRecord(items?.data);

  return {
    periodStart: readNumber(item, "current_period_start")
      ?? readNumber(root, "current_period_start"),
    periodEnd: readNumber(item, "current_period_end")
      ?? readNumber(root, "current_period_end"),
  };
}

export function getInvoiceSubscriptionId(invoice: unknown): string | undefined {
  const root = asRecord(invoice);
  const legacy = readExpandableId(root?.subscription);
  if (legacy) return legacy;

  const parent = asRecord(root?.parent);
  const subscriptionDetails = asRecord(parent?.subscription_details);
  const current = readExpandableId(subscriptionDetails?.subscription);
  if (current) return current;

  const lines = asRecord(root?.lines);
  const line = firstRecord(lines?.data);
  const lineParent = asRecord(line?.parent);
  const subscriptionItemDetails = asRecord(lineParent?.subscription_item_details);
  const invoiceItemDetails = asRecord(lineParent?.invoice_item_details);
  return readExpandableId(subscriptionItemDetails?.subscription)
    ?? readExpandableId(invoiceItemDetails?.subscription);
}

export function getInvoicePriceLookup(invoice: unknown): string | undefined {
  const root = asRecord(invoice);
  const lines = asRecord(root?.lines);
  const line = firstRecord(lines?.data);
  const legacyPrice = asRecord(line?.price);
  const legacyLookup = readString(legacyPrice, "lookup_key");
  if (legacyLookup) return legacyLookup;

  const parent = asRecord(root?.parent);
  const subscriptionDetails = asRecord(parent?.subscription_details);
  const subscriptionMetadata = asRecord(subscriptionDetails?.metadata);
  return readString(subscriptionMetadata, "priceId")
    ?? readString(asRecord(root?.metadata), "priceId");
}
