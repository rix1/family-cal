import { define } from "@/utils.ts";

export default define.page(function AccessRequired() {
  return (
    <>
      <title>Family Calendar</title>
      <main style="max-width:36rem;margin:12vh auto;padding:2rem;font:16px/1.5 system-ui">
        <h1>Family Calendar</h1>
        <p>This private calendar requires a family access link.</p>
      </main>
    </>
  );
});
