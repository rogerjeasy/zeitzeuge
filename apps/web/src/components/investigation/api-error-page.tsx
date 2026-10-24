import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ApiNotice } from "./api-notice";

/** When the API refused or could not be reached: say which, and offer a way back. */
export async function ApiErrorPage({ code, back = "/batches" }: { code: string; back?: string }) {
  const t = await getTranslations("investigation.errors");
  return (
    <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-4 px-4 py-8 sm:px-6">
      <Link
        href={back}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg py-1 text-[0.75rem] text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-3.5" strokeWidth={2} />
        {t("back")}
      </Link>
      <ApiNotice code={code} />
    </div>
  );
}
