import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileMdx } from "nextra/compile";
import { MDXRemote } from "nextra/mdx-remote";

const changelogPath = resolve(process.cwd(), "../..", "CHANGELOG.md");

export async function Changelog() {
  const markdown = await readFile(changelogPath, "utf8");
  const compiledSource = await compileMdx(markdown, {
    defaultShowCopyCode: true,
  });

  return <MDXRemote compiledSource={compiledSource} />;
}
