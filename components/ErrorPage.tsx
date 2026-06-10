import { BrandMark } from "@/components/AppHeader.tsx";

interface Props {
  status: number;
  title: string;
  message: string;
}

export function ErrorPage({ status, title, message }: Props) {
  return (
    <>
      <title>{title} | Family Calendar</title>
      <main class="mx-auto max-w-xl px-6 py-[16vh]">
        <BrandMark />
        <p class="kicker mt-8">Error {status}</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <p class="mt-3 max-w-md text-base leading-relaxed text-ink-2">{message}</p>
        <a
          href="/"
          class="mt-6 inline-block font-medium text-accent-2 underline underline-offset-4"
        >
          Family Calendar
        </a>
      </main>
    </>
  );
}
