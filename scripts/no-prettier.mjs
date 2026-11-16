// Prettier is never used in this repository: oxfmt formats it (`pnpm fmt`).
// This fails when a package.json depends on prettier or on anything named
// after it, when a script runs it, or when a prettier config is committed.
// A package we depend on may still bring its own copy; that copy is its own,
// and nothing here runs it.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// prettier as a command, alone or through npx, pnpm exec or dlx, yarn or bunx;
// not a word inside another name, such as this file's.
const RUNS_PRETTIER =
    /(^|[\s;&|()])(npx\s+|pnpm\s+(exec\s+|dlx\s+)?|yarn\s+|bunx\s+)?prettier(?=\s|$)/;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const found = [];
for (const file of files) {
    const name = file.split("/").at(-1);
    if (/^\.prettierrc|^prettier\.config\.|^\.prettierignore$/.test(name))
        found.push(`${file} is a prettier config`);
    if (name !== "package.json") continue;
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
    ]) {
        for (const dep of Object.keys(pkg[field] ?? {})) {
            if (/prettier/i.test(dep)) found.push(`${file} lists ${dep} in ${field}`);
        }
    }
    for (const [script, command] of Object.entries(pkg.scripts ?? {})) {
        if (RUNS_PRETTIER.test(command)) found.push(`${file}: the ${script} script runs prettier`);
    }
    if ("prettier" in pkg) found.push(`${file} has a prettier field`);
}
if (found.length) {
    console.error(
        `Prettier is not used here: format with oxfmt (pnpm fmt).\n${found.map((line) => `  ${line}`).join("\n")}`,
    );
    process.exit(1);
}
