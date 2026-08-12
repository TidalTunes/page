import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const expected = ["README.md", "demo.js", "index.html", "styles.css", "verify-demo.mjs"];
const actual = readdirSync(root).sort();

for (const file of expected) {
	if (!actual.includes(file)) throw new Error(`Missing demo file: ${file}`);
}

const sourceFiles = actual.filter((file) => [".html", ".css", ".js"].includes(extname(file)));
const combined = sourceFiles.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
const html = readFileSync(join(root, "index.html"), "utf8");
const script = readFileSync(join(root, "demo.js"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");
const forbidden = [
	[/\bfetch\s*\(/, "fetch"],
	[/XMLHttpRequest/, "XMLHttpRequest"],
	[/WebSocket/, "WebSocket"],
	[/EventSource/, "EventSource"],
	[/localStorage|sessionStorage|indexedDB/, "browser storage"],
	[/https?:\/\//, "remote URL"],
	[/<form[^>]+action=/i, "form action"],
];

for (const [pattern, label] of forbidden) {
	if (pattern.test(combined)) throw new Error(`Static demo contains forbidden ${label}`);
}

if (!html.includes("SCRIPTED DEMO · NO MODEL/BACKEND") || !html.includes('id="footer-provider">demo</span>')) {
	throw new Error("Demo labeling is missing");
}

for (const id of ["shell-screen", "kashicode-screen", "transcript", "allocation-list", "prompt-input", "model-dialog"]) {
	if (!html.includes(`id="${id}"`)) throw new Error(`Missing terminal surface: ${id}`);
}

for (const behavior of [
	'const command = "kashicode"',
	"SCENARIOS",
	"runScenario",
	"beginActivityTool",
	"completeActivityTool",
	"compactContext",
	"openModelDialog",
]) {
	if (!script.includes(behavior)) throw new Error(`Missing scripted terminal behavior: ${behavior}`);
}

if (!script.includes('status: "pending"') || !script.includes('tool.status = "done"')) {
	throw new Error("Tool calls do not expose the scripted pending-to-complete lifecycle");
}

if (
	script.includes('Kashicode [SCRIPTED DEMO]') ||
	!script.includes("const contextPercent") ||
	!script.includes('provider: "demo"')
) {
	throw new Error("Terminal title or footer framing does not match the portfolio presentation");
}

if (!readme.includes('sandbox="allow-scripts"') || readme.includes('sandbox=""')) {
	throw new Error("Iframe sandbox instructions do not permit only the required script capability");
}

console.log(
	`Verified ${sourceFiles.length} static source files: terminal lifecycle present; no backend, network, or persistence APIs found.`,
);
