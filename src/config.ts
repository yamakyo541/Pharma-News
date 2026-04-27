import { z } from "zod";

const gmailToSchema = z
  .string()
  .min(1)
  .superRefine((val, ctx) => {
    const parts = val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GMAIL_TO には1件以上のメールアドレスを指定してください",
      });
      return;
    }
    const email = z.string().email();
    for (const p of parts) {
      if (!email.safeParse(p).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `無効なメールアドレス: ${p}`,
        });
      }
    }
  });

const baseSchema = z.object({
  JINA_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GMAIL_USER: z.string().email(),
  GMAIL_APP_PASSWORD: z
    .string()
    .min(1)
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(z.string().min(16, "アプリパスワードは16文字です（Googleアカウントのセキュリティで発行）")),
  GMAIL_TO: gmailToSchema,
  USE_SAMPLE_DATA: z
    .enum(["true", "false", ""])
    .default("false")
    .transform((v) => v === "true"),
});

type BaseParsed = z.infer<typeof baseSchema>;
type Common = Omit<BaseParsed, "USE_SAMPLE_DATA">;

export type Config =
  | (Common & { USE_SAMPLE_DATA: true })
  | (Common & { USE_SAMPLE_DATA: false });

export function loadConfig(): Config {
  const baseResult = baseSchema.safeParse(process.env);
  if (!baseResult.success) {
    reportAndExit("環境変数の検証に失敗しました", baseResult.error);
  }

  const { USE_SAMPLE_DATA, ...common } = baseResult.data;

  if (USE_SAMPLE_DATA) {
    return { ...common, USE_SAMPLE_DATA: true };
  }

  return { ...common, USE_SAMPLE_DATA: false };
}

function reportAndExit(title: string, error: z.ZodError): never {
  const missing = error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`[CONFIG] ${title}:\n${missing}`);
  process.exit(1);
}
