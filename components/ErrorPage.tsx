interface Props {
  status: number;
  title: string;
  message: string;
}

export function ErrorPage({ status, title, message }: Props) {
  return (
    <>
      <title>{title} | Family Calendar</title>
      <main class="error-page">
        <p class="error-code">{status}</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <a href="/">Family Calendar</a>
      </main>
      <style>
        {`
          .error-page {
            max-width: 38rem;
            margin: 14vh auto;
            padding: 2rem;
            color: #1d2422;
          }
          .error-code {
            margin: 0 0 .75rem;
            color: #0b4f4a;
            font-size: .75rem;
            font-weight: 700;
            letter-spacing: .18em;
            text-transform: uppercase;
          }
          .error-page h1 {
            margin: 0;
            font-size: clamp(2rem, 7vw, 4rem);
            line-height: 1;
          }
          .error-page p:not(.error-code) {
            max-width: 32rem;
            margin: 1.25rem 0;
            color: #68736f;
            font-size: 1.05rem;
            line-height: 1.6;
          }
          .error-page a {
            color: #0f766e;
            font-weight: 650;
          }
          @media (prefers-color-scheme: dark) {
            .error-page { color: #edf2ef; }
            .error-code, .error-page a { color: #8edbd0; }
            .error-page p:not(.error-code) { color: #a8b1ac; }
          }
        `}
      </style>
    </>
  );
}
