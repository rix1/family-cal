export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function htmlTemplate(name: string): Promise<Response> {
  const html = await Deno.readTextFile(`${Deno.cwd()}/templates/${name}`);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
