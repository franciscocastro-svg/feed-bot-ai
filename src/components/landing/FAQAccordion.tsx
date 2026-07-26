import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FAQItem } from "./landingContent";

type FAQAccordionProps = {
  items: FAQItem[];
};

export function FAQAccordion({ items }: FAQAccordionProps) {
  return (
    <Accordion type="single" collapsible className="space-y-3">
      {items.map((item, index) => (
        <AccordionItem
          key={item.q}
          value={`faq-${index}`}
          className="rounded-2xl border border-white/10 bg-white/[0.035] px-5 data-[state=open]:border-primary/25 data-[state=open]:bg-primary/[0.035] sm:px-6"
        >
          <AccordionTrigger className="min-h-16 text-left font-display text-base font-medium hover:no-underline sm:text-lg">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="max-w-2xl pb-5 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            {item.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
