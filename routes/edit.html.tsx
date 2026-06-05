import { define } from "@/utils.ts";

export default define.page(function EditorAccessRequired() {
  return (
    <>
      <title>Edit Family Dates</title>
      <main style="max-width:36rem;margin:12vh auto;padding:2rem;font:16px/1.5 system-ui">
        <h1>Editor access required</h1>
        <p>Open the private editor link issued for your family.</p>
      </main>
    </>
  );
});
