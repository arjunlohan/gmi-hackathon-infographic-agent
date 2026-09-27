import { defineAgent } from "eve";

export default defineAgent({
  model: "meta/muse-spark-1.3-contributor",
  reasoning: "xhigh",
  // sharp ships a native binary; keep it out of the compiled tool bundle and trace it into the
  // hosted output (the reviewer uses it to crop and zoom disputed labels).
  build: { externalDependencies: ["sharp"] },
});
