/**
 * KASHICODE SCRIPTED TERMINAL DEMO
 *
 * Frontend-only portfolio simulation. This file never calls a model, provider,
 * network endpoint, shell, filesystem, credential store, or persistence API.
 * Every visible response, tool result, skill, token count, and file is scripted.
 */

(() => {
	"use strict";

	const DEMO_VERSION = "2.1.0";
	const CONTEXT_WINDOW = 272000;
	const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
	const MEMORY_MODES = ["none", "read", "read-write"];
	const MODEL_OPTIONS = [
		{ provider: "demo", id: "kashi-portfolio", scope: "recommended" },
		{ provider: "demo", id: "context-lab", scope: "large context" },
		{ provider: "demo", id: "ui-prototype", scope: "fast" },
	];
	const COMMANDS = [
		{ name: "/help", description: "Show the supported controls" },
		{ name: "/tour", description: "Run the complete harness tour" },
		{ name: "/clear", description: "Clear the visible transcript" },
		{ name: "/new", description: "Start a fresh session" },
		{ name: "/compact", description: "Compact the active context" },
		{ name: "/memory", description: "Cycle repository memory mode" },
		{ name: "/model", description: "Open the model selector" },
		{ name: "/about", description: "Show version information" },
		{ name: "/exit", description: "Return to the shell" },
	];
	const INITIAL_ALLOCATION = {
		system: 630,
		tools: 920,
		skills: 860,
		agents: 310,
		memory: 720,
		files: 240,
		chat: 42,
		compact: 0,
		other: 96,
	};

	const state = {
		mode: "shell",
		autoTypingShell: false,
		autoTourTimer: undefined,
		busy: false,
		runId: 0,
		runTimers: new Set(),
		bootTimers: new Set(),
		activityLevel: 3,
		activitySelectionPending: false,
		thinkingVisible: true,
		thinkingLevel: "medium",
		transcriptView: "user",
		memoryMode: "read-write",
		modelIndex: 0,
		modelDialogIndex: 0,
		commandIndex: 0,
		commandMatches: [],
		files: ["AGENTS.md"],
		skills: ["find-skills", "frontend-design", "repository-memory"],
		allocation: { ...INITIAL_ALLOCATION },
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		lastCtrlC: 0,
	};

	const elements = {
		terminalTitle: document.querySelector("#terminal-title-text"),
		terminalViewport: document.querySelector(".terminal-viewport"),
		shellScreen: document.querySelector("#shell-screen"),
		shellOutput: document.querySelector("#shell-output"),
		shellForm: document.querySelector("#shell-form"),
		shellInput: document.querySelector("#shell-input"),
		kashicodeScreen: document.querySelector("#kashicode-screen"),
		transcript: document.querySelector("#transcript"),
		latestButton: document.querySelector("#latest-button"),
		promptRegion: document.querySelector(".prompt-region"),
		promptForm: document.querySelector("#prompt-form"),
		promptInput: document.querySelector("#prompt-input"),
		commandMenu: document.querySelector("#command-menu"),
		memoryModeLabel: document.querySelector("#memory-mode-label"),
		viewToggle: document.querySelector("#view-toggle"),
		viewUser: document.querySelector("#view-user"),
		viewModel: document.querySelector("#view-model"),
		contextPercent: document.querySelector("#context-percent"),
		contextUsed: document.querySelector("#context-used"),
		contextMeterFill: document.querySelector("#context-meter-fill"),
		allocationList: document.querySelector("#allocation-list"),
		skillCount: document.querySelector("#skill-count"),
		skillList: document.querySelector("#skill-list"),
		fileCount: document.querySelector("#file-count"),
		fileList: document.querySelector("#file-list"),
		toolCount: document.querySelector("#tool-count"),
		toolList: document.querySelector("#tool-list"),
		footerStats: document.querySelector("#footer-stats"),
		footerProvider: document.querySelector("#footer-provider"),
		footerModel: document.querySelector("#footer-model"),
		footerThinking: document.querySelector("#footer-thinking"),
		modelDialog: document.querySelector("#model-dialog"),
		modelOptions: document.querySelector("#model-options"),
	};

	function escapeHtml(value) {
		return String(value)
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;")
			.replaceAll("'", "&#039;");
	}

	function inlineMarkup(value) {
		return escapeHtml(value)
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	}

	function paragraphMarkup(value) {
		return String(value)
			.split(/\n\n+/)
			.map((paragraph) => `<p>${inlineMarkup(paragraph).replaceAll("\n", "<br>")}</p>`)
			.join("");
	}

	function schedule(collection, callback, delay) {
		const timer = window.setTimeout(() => {
			collection.delete(timer);
			callback();
		}, REDUCED_MOTION ? Math.min(delay, 35) : delay);
		collection.add(timer);
		return timer;
	}

	function clearTimerCollection(collection) {
		for (const timer of collection) window.clearTimeout(timer);
		collection.clear();
	}

	function waitForRun(delay, runId) {
		return new Promise((resolve) => {
			schedule(state.runTimers, () => resolve(runId === state.runId), delay);
		});
	}

	function currentModel() {
		return MODEL_OPTIONS[state.modelIndex] || MODEL_OPTIONS[0];
	}

	function updateTerminalTitle() {
		const probe = document.createElement("span");
		probe.textContent = "0000000000";
		probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;";
		elements.terminalViewport.append(probe);
		const widthPerCharacter = Math.max(1, probe.getBoundingClientRect().width / 10);
		const lineHeight = Math.max(1, Number.parseFloat(getComputedStyle(elements.terminalViewport).lineHeight));
		probe.remove();
		const columns = Math.max(1, Math.floor((elements.terminalViewport.clientWidth - 12) / widthPerCharacter));
		const rows = Math.max(1, Math.floor((elements.terminalViewport.clientHeight - 8) / lineHeight));
		const processTitle = state.mode === "kashicode" ? "Kashicode" : "zsh";
		elements.terminalTitle.textContent = `kashi — ${processTitle} — ${columns}×${rows}`;
	}

	function memoryModeText(mode = state.memoryMode) {
		switch (mode) {
			case "none":
				return "No memory";
			case "read":
				return "Read only";
			default:
				return "Read + update";
		}
	}

	function activeTools() {
		const base = ["read", "bash", "edit", "write", "grep", "find", "ls"];
		return state.memoryMode === "none" ? base : [...base, "history", "repo-info"];
	}

	function formatTokens(value) {
		if (value < 1000) return String(value);
		if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
		return `${Math.round(value / 1000)}k`;
	}

	function nearTranscriptBottom() {
		return elements.transcript.scrollHeight - elements.transcript.scrollTop - elements.transcript.clientHeight < 56;
	}

	function scrollTranscript(force = false) {
		if (force || nearTranscriptBottom()) {
			elements.transcript.scrollTop = elements.transcript.scrollHeight;
			elements.latestButton.hidden = true;
		} else {
			elements.latestButton.hidden = false;
		}
	}

	function appendTranscript(node) {
		elements.transcript.append(node);
		scrollTranscript(true);
		return node;
	}

	function appendShellRecord(command) {
		const row = document.createElement("div");
		row.className = "shell-record";
		row.innerHTML = `<span class="shell-user">kashi@studio-mac</span><span class="shell-separator">:</span><span class="shell-path">~/portfolio-lab</span><span class="shell-symbol">%</span> ${escapeHtml(command)}`;
		elements.shellOutput.append(row);
		elements.shellScreen.scrollTop = elements.shellScreen.scrollHeight;
	}

	function appendShellMessage(text, className = "") {
		const row = document.createElement("div");
		row.className = `shell-message${className ? ` ${className}` : ""}`;
		row.textContent = text;
		elements.shellOutput.append(row);
		elements.shellScreen.scrollTop = elements.shellScreen.scrollHeight;
	}

	function cancelAutoBoot() {
		state.autoTypingShell = false;
		clearTimerCollection(state.bootTimers);
	}

	function beginShellBoot() {
		appendShellMessage("Last login: Tue Aug 11 19:42:06 on ttys003", "dim");
		const command = "kashicode";
		let index = 0;
		state.autoTypingShell = true;
		schedule(state.bootTimers, function typeNextCharacter() {
			if (!state.autoTypingShell || state.mode !== "shell") return;
			index += 1;
			elements.shellInput.value = command.slice(0, index);
			if (index < command.length) {
				schedule(state.bootTimers, typeNextCharacter, 42);
				return;
			}
			state.autoTypingShell = false;
			schedule(state.bootTimers, () => executeShellCommand(command), 330);
		}, 620);
	}

	function executeShellCommand(providedCommand) {
		const command = (providedCommand ?? elements.shellInput.value).trim();
		appendShellRecord(command);
		elements.shellInput.value = "";
		if (!command) return;
		if (["./kashicode.sh", "kashicode"].includes(command)) {
			appendShellMessage("Starting Kashicode…", "dim");
			schedule(state.bootTimers, () => launchKashicode(true), 420);
			return;
		}
		if (command === "clear") {
			elements.shellOutput.replaceChildren();
			return;
		}
		if (command === "help") {
			appendShellMessage("Commands: kashicode  clear  help");
			return;
		}
		appendShellMessage(`zsh: command not found: ${command}`);
	}

	function launchKashicode(autoTour) {
		cancelAutoBoot();
		state.mode = "kashicode";
		elements.shellScreen.hidden = true;
		elements.kashicodeScreen.hidden = false;
		updateTerminalTitle();
		resetKashicodeSession(false);
		elements.promptInput.focus({ preventScroll: true });
		if (autoTour) {
			state.autoTourTimer = window.setTimeout(() => {
				state.autoTourTimer = undefined;
				if (state.mode !== "kashicode" || state.busy || elements.promptInput.value) return;
				const prompt = "Use some tools and skills to explain this repository.";
				addUser(prompt);
				void runScenario("tour");
			}, REDUCED_MOTION ? 80 : 700);
		}
	}

	function exitKashicode() {
		cancelAutoTour();
		interrupt(false);
		closeModelDialog();
		state.mode = "shell";
		elements.kashicodeScreen.hidden = true;
		elements.shellScreen.hidden = false;
		updateTerminalTitle();
		appendShellMessage("Kashicode exited.", "dim");
		elements.shellInput.focus({ preventScroll: true });
	}

	function cancelAutoTour() {
		if (state.autoTourTimer !== undefined) {
			window.clearTimeout(state.autoTourTimer);
			state.autoTourTimer = undefined;
		}
	}

	function addUser(text) {
		const node = document.createElement("div");
		node.className = "turn-user";
		node.textContent = text;
		appendTranscript(node);
		const tokens = Math.max(5, Math.round(text.length / 3.7));
		state.allocation.chat += tokens;
		state.inputTokens += tokens;
		updateHarnessState();
	}

	function createAssistant(text = "") {
		const node = document.createElement("div");
		node.className = `turn-assistant${state.transcriptView === "model" ? " model-view" : ""}`;
		node.dataset.rawText = text;
		node.innerHTML = state.transcriptView === "model" ? escapeHtml(text) : paragraphMarkup(text);
		return appendTranscript(node);
	}

	async function streamAssistant(text, runId) {
		const node = createAssistant("");
		const pieces = text.split(/(\s+)/);
		if (REDUCED_MOTION) {
			node.dataset.rawText = text;
			node.innerHTML = state.transcriptView === "model" ? escapeHtml(text) : paragraphMarkup(text);
		} else {
			let rendered = "";
			for (let index = 0; index < pieces.length; index += 4) {
				if (!(await waitForRun(18, runId))) return false;
				rendered += pieces.slice(index, index + 4).join("");
				node.dataset.rawText = rendered;
				node.innerHTML = state.transcriptView === "model" ? escapeHtml(rendered) : paragraphMarkup(rendered);
				scrollTranscript();
			}
		}
		const tokens = Math.max(12, Math.round(text.length / 3.8));
		const providerInput = Math.round(totalContextTokens() * 0.46);
		state.outputTokens += tokens;
		state.allocation.chat += tokens;
		state.inputTokens += providerInput;
		state.cacheReadTokens += providerInput;
		updateHarnessState();
		return true;
	}

	function addSystem(tag, text, warning = false) {
		const node = document.createElement("div");
		node.className = `system-line${warning ? " warning" : ""}`;
		node.innerHTML = `<span class="system-tag">[${escapeHtml(tag)}]</span> ${inlineMarkup(text)}`;
		return appendTranscript(node);
	}

	function addSkill(name, summary) {
		if (!state.skills.includes(name)) state.skills.push(name);
		const node = document.createElement("div");
		node.className = "skill-line";
		node.title = summary;
		node.innerHTML = `<span class="skill-tag">[skill]</span> <span class="skill-name">${escapeHtml(name)}</span><span class="skill-range">:1–200</span> <span>(ctrl+r, then 4 to expand)</span>`;
		appendTranscript(node);
		state.allocation.skills += 170;
		updateHarnessState();
	}

	function toolSubject(tool) {
		return tool.path || tool.query || tool.command || "";
	}

	function toolHeader(tool) {
		const details = toolSubject(tool);
		return details ? `${tool.name}  ${details}` : tool.name;
	}

	function toolStatusMarkup(tool) {
		if (tool.status === "pending") {
			return '<span class="activity-spinner tool-spinner">⠋</span>running';
		}
		if (tool.status === "interrupted") return "stopped";
		return "done";
	}

	function compactToolOutput(tool) {
		return tool.output
			.split("\n")
			.map((line) => line.trim())
			.find(Boolean) || "Completed without output.";
	}

	function createToolDetail(tool, expanded) {
		const node = document.createElement("div");
		node.className = `tool-detail ${tool.status || "done"}`;
		const button = document.createElement("button");
		button.className = "tool-detail-button";
		button.type = "button";
		button.setAttribute("aria-expanded", String(expanded));
		button.innerHTML = `<span><strong>${escapeHtml(tool.name)}</strong>${toolSubject(tool) ? `  ${escapeHtml(toolSubject(tool))}` : ""}</span><span class="tool-detail-status">${toolStatusMarkup(tool)}</span>`;
		const output = document.createElement("pre");
		output.className = "tool-detail-output";
		output.textContent = expanded ? tool.output : compactToolOutput(tool);
		output.hidden = tool.status === "pending";
		button.addEventListener("click", () => {
			output.hidden = !output.hidden;
			button.setAttribute("aria-expanded", String(!output.hidden));
		});
		node.append(button, output);
		return node;
	}

	function createActivity() {
		const node = document.createElement("div");
		node.className = "activity";
		node.dataset.complete = "false";
		node._demoItems = [];
		appendTranscript(node);
		return node;
	}

	function appendActivityHeading(node, step) {
		node._demoItems.push({
			type: "heading",
			heading: step.heading,
			thinking: step.thinking,
			thinkingTokens: step.thinkingTokens,
		});
		renderActivity(node);
	}

	function beginActivityTool(node, tool) {
		const activeTool = { ...tool, type: "tool", status: "pending" };
		node._demoItems.push(activeTool);
		renderActivity(node);
		return activeTool;
	}

	function completeActivityTool(node, tool) {
		tool.status = "done";
		state.allocation.tools += Math.max(70, Math.round(tool.output.length / 2.4));
		renderActivity(node);
		updateHarnessState();
	}

	function recordStepFiles(step) {
		for (const file of step.files || []) {
			if (!state.files.includes(file)) state.files.push(file);
			state.allocation.files += 150;
		}
		updateHarnessState();
	}

	function activityItems(node) {
		const items = node._demoItems || [];
		return state.transcriptView === "model"
			? items.filter((item) => item.type !== "tool" || !item.modelHidden)
			: items;
	}

	function toolsAfterLatestHeading(items) {
		let startIndex = 0;
		for (let index = 0; index < items.length; index += 1) {
			if (items[index].type === "heading") startIndex = index + 1;
		}
		return items.slice(startIndex).filter((item) => item.type === "tool");
	}

	function renderActivity(node) {
		const complete = node.dataset.complete === "true";
		const items = activityItems(node);
		const headings = items.filter((item) => item.type === "heading");
		const tools = items.filter((item) => item.type === "tool");
		const latestHeading = headings.at(-1)?.heading || "Thinking";
		const thinkingTokens = headings.reduce((sum, item) => sum + item.thinkingTokens, 0);
		if (state.activityLevel === 1) {
			if (complete) {
				node.innerHTML = `<div class="activity-summary">[activity: ${tools.length} tool call${tools.length === 1 ? "" : "s"}, ~${thinkingTokens} thinking tokens (ctrl+r, then 2 for headers)]</div>`;
			} else {
				const activeTools = toolsAfterLatestHeading(items);
				node.innerHTML = `<div class="activity-live"><span class="activity-spinner">${SPINNER_FRAMES[0]}</span>${escapeHtml(latestHeading)}...</div>${activeTools.map((tool) => `<div class="tool-header">${escapeHtml(toolHeader(tool))}</div>`).join("")}`;
				startActivitySpinner(node);
			}
			return;
		}

		if (state.activityLevel === 2) {
			node.innerHTML = `<div class="activity-headers">${items
				.map((item, index) => {
					if (item.type === "tool") return `<div class="tool-header">${escapeHtml(item.name)}</div>`;
					const latest = index === items.length - 1 && !complete;
					return `<div class="activity-header">${latest ? '<span class="activity-spinner">⠋</span>' : "◆ "}${escapeHtml(item.heading)}</div>`;
				})
				.join("")}</div>`;
			if (!complete) startActivitySpinner(node);
			return;
		}

		if (state.activityLevel === 3) {
			node.innerHTML = `<div class="activity-headers">${items
				.map((item, index) => {
					if (item.type === "tool") {
						const status = item.status === "pending" ? '<span class="activity-spinner">⠋</span>' : "  ";
						return `<div class="tool-header">${status}${escapeHtml(toolHeader(item))}</div>`;
					}
					const isLatestHeading = !complete && !items.slice(index + 1).some((candidate) => candidate.type === "heading");
					return `<div class="activity-header">${isLatestHeading ? '<span class="activity-spinner">⠋</span>' : "◆ "}${escapeHtml(item.heading)}</div>`;
				})
				.join("")}</div>`;
			if (!complete) startActivitySpinner(node);
			return;
		}

		const detail = document.createElement("div");
		detail.className = "activity-stream";
		for (const [index, item] of items.entries()) {
			if (item.type === "tool") {
				detail.append(createToolDetail(item, state.activityLevel === 4));
				continue;
			}
			const heading = document.createElement("div");
			const isLatestHeading = !complete && !items.slice(index + 1).some((candidate) => candidate.type === "heading");
			if (state.activityLevel === 4) {
				heading.className = "thinking-detail";
				heading.hidden = !state.thinkingVisible;
				heading.innerHTML = `<strong>${escapeHtml(item.heading)}</strong>${escapeHtml(item.thinking)}`;
			} else {
				heading.className = "activity-header";
				heading.innerHTML = `${isLatestHeading ? '<span class="activity-spinner">⠋</span>' : "◆ "}${escapeHtml(item.heading)}`;
			}
			detail.append(heading);
		}
		node.replaceChildren(detail);
		if (!complete) startActivitySpinner(node);
	}

	function startActivitySpinner(node) {
		if (node._demoSpinnerActive) return;
		node._demoSpinnerActive = true;
		let frame = 0;
		const runId = state.runId;
		const tick = () => {
			if (runId !== state.runId || node.dataset.complete === "true") {
				node._demoSpinnerActive = false;
				return;
			}
			for (const spinner of node.querySelectorAll(".activity-spinner")) {
				spinner.textContent = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
			}
			frame += 1;
			schedule(state.runTimers, tick, 120);
		};
		schedule(state.runTimers, tick, 120);
	}

	function completeActivity(node) {
		node.dataset.complete = "true";
		node._demoSpinnerActive = false;
		renderActivity(node);
	}

	function renderAllActivities() {
		for (const node of elements.transcript.querySelectorAll(".activity")) renderActivity(node);
		scrollTranscript(true);
	}

	function totalContextTokens() {
		return Object.values(state.allocation).reduce((sum, value) => sum + value, 0);
	}

	function updateHarnessState() {
		const entries = Object.entries(state.allocation);
		const total = totalContextTokens();
		const contextPercent = (total / CONTEXT_WINDOW) * 100;
		elements.contextPercent.textContent = `${contextPercent.toFixed(1)}%`;
		elements.contextUsed.textContent = `${formatTokens(total)} / 272k tokens`;
		elements.contextMeterFill.style.width = `${Math.min(100, contextPercent)}%`;
		elements.memoryModeLabel.textContent = memoryModeText();
		elements.allocationList.replaceChildren();

		for (const [name, value] of entries) {
			const share = total > 0 ? (value / total) * 100 : 0;
			const percentLabel = value > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`;
			const row = document.createElement("div");
			row.className = "allocation-row";
			row.dataset.color = name;
			row.innerHTML = `<span class="allocation-name">${escapeHtml(name)}</span><span class="allocation-percent">${percentLabel}</span><span class="allocation-tokens">${formatTokens(value)}</span><span class="allocation-meter"><span style="width:${Math.max(value ? 2 : 0, share)}%"></span></span>`;
			elements.allocationList.append(row);
		}

		elements.skillCount.textContent = String(state.skills.length);
		elements.skillList.replaceChildren(
			...state.skills.slice(0, 5).map((skill) => {
				const item = document.createElement("li");
				item.textContent = skill;
				return item;
			}),
		);
		elements.fileCount.textContent = String(state.files.length);
		elements.fileList.replaceChildren(
			...state.files.slice(-4).map((file) => {
				const item = document.createElement("li");
				item.textContent = file;
				return item;
			}),
		);
		const tools = activeTools();
		elements.toolCount.textContent = String(tools.length);
		elements.toolList.textContent = tools.join("  ");

		elements.footerStats.textContent = `↑${formatTokens(state.inputTokens)} ↓${formatTokens(state.outputTokens)} ${contextPercent.toFixed(1)}%/272k (auto)`;
		const model = currentModel();
		elements.footerProvider.textContent = model.provider;
		elements.footerModel.textContent = model.id;
		elements.footerThinking.textContent = state.thinkingLevel;
	}

	function setBusy(busy) {
		state.busy = busy;
		elements.promptRegion.classList.toggle("busy", busy);
	}

	function interrupt(showMessage = true) {
		if (!state.busy) return false;
		state.runId += 1;
		clearTimerCollection(state.runTimers);
		for (const activity of elements.transcript.querySelectorAll('.activity[data-complete="false"]')) {
			for (const item of activity._demoItems || []) {
				if (item.type === "tool" && item.status === "pending") item.status = "interrupted";
			}
			activity.dataset.complete = "true";
			activity._demoSpinnerActive = false;
			renderActivity(activity);
		}
		setBusy(false);
		if (showMessage) addSystem("interrupted", "Playback stopped.", true);
		return true;
	}

	const SCENARIOS = {
		tour: {
			skill: ["repository-memory", "Expand only the repository paths needed for this turn, then verify memory against source."],
			steps: [
				{
					heading: "Expanding adaptive repository memory.",
					thinking: "Kashicode starts with a compact repository tree. I can raise detail only for the memory and context paths needed now instead of spending tokens on the whole codebase.",
					thinkingTokens: 206,
					tools: [
						{
							name: "repo-info",
							path: "packages/coding-agent/src/core  tier 3",
							output:
								"Top-level repository memory raised to Tier 3 for packages/coding-agent/src/core.\n\nThe raw repo-info call and result self-remove from the next model transcript; the expanded memory stays in top-level context.",
							modelHidden: true,
						},
					],
					files: [],
				},
				{
					heading: "Reading durable decisions, not replaying every chat.",
					thinking: "Decision history is append-only and queryable by date. It can recover why a project choice was made without loading prior conversations into every request.",
					thinkingTokens: 188,
					tools: [
						{
							name: "history",
							query: "2026-08-01..2026-08-11",
							output:
								"2026-08-08 decision documentation-routing\nRoute Kashicode self-questions to concise documentation shipped with the harness.\n\n2026-08-10 decision memory-root-safety\nNever establish repository memory in an arbitrary desktop folder.",
						},
					],
					files: [],
				},
				{
					heading: "Accounting for exactly what the model can still see.",
					thinking: "Read results and write/edit payloads remain model-visible through tool history. Kashicode attributes that content to FILES until a compaction boundary removes it.",
					thinkingTokens: 239,
					tools: [
						{
							name: "read",
							path: "packages/coding-agent/src/core/invisible-tools.ts",
							output:
								"filterInvisibleToolTranscript(messages)\napplyInvisibleToolContext(messages, entries)\n\nKashicode can persist a tool event for sessions/UI while omitting its raw trace from the next provider request.",
						},
						{
							name: "edit",
							path: "packages/coding-agent/src/core/context-allocation.ts",
							output:
								"oldText/newText are counted under FILES while present in active tool history.",
						},
					],
					files: ["invisible-tools.ts", "context-allocation.ts"],
				},
				{
					heading: "Preserving continuity across compaction and sessions.",
					thinking: "Before compacting, read-write memory updates repository state and decision history independently. The session remains an append-only JSONL branch even after old provider context is summarized.",
					thinkingTokens: 217,
					tools: [
						{
							name: "read",
							path: "packages/coding-agent/src/core/session-manager.ts",
							output:
								"Session entries form a parent-linked JSONL tree. Compaction appends a summary boundary; it does not rewrite prior session history.",
						},
					],
					files: ["session-manager.ts"],
				},
			],
			compactAfterSteps: true,
			response:
				"Kashicode treats context as structured, inspectable state rather than one undifferentiated transcript. `repo-info` raises memory detail only where needed, then its raw tool trace removes itself from the next model-facing conversation while the updated top-level memory remains. Press `Ctrl+X` to compare the user and model transcript views.\n\nThe sidebar tracks system instructions, tools, skills, project instructions, memory, file payloads, chat, and compacted history separately. Before compaction, Kashicode can update repository state and decision history in independent calls; afterward, file/tool payloads leave active context while the append-only JSONL session still preserves the branch. `/debug` can reveal the exact last provider request, and complete TUI folders can be swapped without rewriting the agent loop.",
		},
		frontend: {
			skill: ["frontend-design", "Follow the project's terminal-first interaction and layout conventions."],
			steps: [
				{
					heading: "Inspecting the existing portfolio surface.",
					thinking: "I should find the current project card and its responsive media boundary before proposing a terminal embed.",
					thinkingTokens: 173,
					tools: [
						{ name: "find", path: "src  (depth 3)", output: "src/app.ts\nsrc/styles.css\nsrc/components/project-card.ts" },
						{ name: "read", path: "src/components/project-card.ts", output: "export function ProjectCard(project) { ... }\n// 48-line preview" },
					],
					files: ["project-card.ts", "styles.css"],
				},
				{
					heading: "Preparing the terminal embed.",
					thinking: "The existing media region can host one responsive iframe. The terminal should fill it directly without an additional decorative card.",
					thinkingTokens: 126,
					tools: [
						{ name: "edit", path: "src/components/project-card.ts", output: "+ embed isolated Kashicode iframe\n+ preserve terminal aspect ratio\n+ add accessible title" },
					],
					files: ["project-card.ts"],
				},
			],
			response:
				"The project card can host the terminal as a single responsive media surface. The change preserves the native terminal proportions on desktop and collapses the context rail at narrow widths.",
		},
		memory: {
			skill: ["repository-memory", "Use the repository map for orientation and history for durable decisions."],
			steps: [
				{
					heading: "Expanding the relevant memory path.",
					thinking: "The question concerns context architecture, so I can request more detail only for coding-agent and avoid loading the entire repository map.",
					thinkingTokens: 212,
					tools: [
						{ name: "repo-info", path: "packages/coding-agent  tier 3", output: "Repository context raised to Tier 3 for packages/coding-agent." },
						{ name: "history", query: "2026-08-01..2026-08-11", output: "2026-08-08 decision documentation-routing\nRoute Kashicode self-questions to packaged absolute documentation paths." },
					],
					files: [],
				},
				{
					heading: "Verifying memory placement in source.",
					thinking: "Memory can be stale, so I will confirm where the formatted blocks enter the active system prompt.",
					thinkingTokens: 138,
					tools: [
						{ name: "read", path: "packages/coding-agent/src/core/system-prompt.ts", output: "identity → tools → guidelines → project instructions → repository memory → skills → date/cwd" },
					],
					files: ["system-prompt.ts"],
				},
			],
			response:
				"Repository memory is formatted into top-level project context after `AGENTS.md` or `CLAUDE.md`. `repo-info` increases detail for a selected path, while `history` reads durable decisions by date range. Both tools disappear entirely when memory is disabled.\n\nThe source read confirms the memory map rather than trusting it blindly.",
		},
		implementation: {
			skill: ["code-review", "Prioritize behavioral regressions, ownership boundaries, and focused verification."],
			steps: [
				{
					heading: "Tracing the reported behavior.",
					thinking: "I should locate the context accounting source and its nearest regression coverage before editing.",
					thinkingTokens: 198,
					tools: [
						{ name: "grep", query: "getContextAllocation  packages/coding-agent", output: "src/core/agent-session.ts:3420\nsrc/modes/kashicode-style/components/context-side-panel.ts:101" },
						{ name: "read", path: "packages/coding-agent/test/minimal-harness.test.ts", output: "test(\"context allocation categorizes active prompt and conversation blocks\", ...)" },
					],
					files: ["agent-session.ts", "minimal-harness.test.ts"],
				},
				{
					heading: "Applying and checking the narrow fix.",
					thinking: "The ownership is local to context allocation. One correction and one focused assertion are sufficient.",
					thinkingTokens: 167,
					tools: [
						{ name: "edit", path: "packages/coding-agent/src/core/context-allocation.ts", output: "- stale category assignment\n+ current category assignment" },
						{ name: "bash", command: "npm test", output: "tests 44\npass 44\nfail 0" },
					],
					files: ["context-allocation.ts"],
				},
			],
			response:
				"The allocation correction is scoped to `context-allocation.ts` and covered by the focused harness test. The test run reports 44 passing tests.",
		},
	};

	function chooseScenario(prompt) {
		const lower = prompt.toLowerCase();
		if (/design|front.?end|ui|interface|website|portfolio|embed/.test(lower)) return "frontend";
		if (/memory|context|repo.info|history|architecture/.test(lower)) return "memory";
		if (/test|bug|fix|review|implement|code/.test(lower)) return "implementation";
		return "tour";
	}

	async function runScenario(name) {
		if (state.busy) return;
		setBusy(true);
		const runId = ++state.runId;
		const scenario = SCENARIOS[name] || SCENARIOS.tour;
		if (scenario.skill) {
			if (!(await waitForRun(190, runId))) return;
			addSkill(...scenario.skill);
		}
		const activity = createActivity();
		for (const step of scenario.steps) {
			if (!(await waitForRun(230, runId))) return;
			appendActivityHeading(activity, step);
			if (!(await waitForRun(170, runId))) return;
			for (const tool of step.tools) {
				const activeTool = beginActivityTool(activity, tool);
				if (!(await waitForRun(REDUCED_MOTION ? 35 : 280, runId))) return;
				completeActivityTool(activity, activeTool);
				if (!(await waitForRun(70, runId))) return;
			}
			recordStepFiles(step);
		}
		completeActivity(activity);
		if (scenario.compactAfterSteps) {
			if (!(await waitForRun(260, runId))) return;
			addSystem(
				"memory",
				"Repository state and decision history updated independently before compaction.",
			);
			if (!(await waitForRun(260, runId))) return;
			applyCompactionBoundary();
		}
		if (!(await waitForRun(180, runId))) return;
		const completed = await streamAssistant(scenario.response, runId);
		if (completed && runId === state.runId) setBusy(false);
	}

	function resizePrompt() {
		elements.promptInput.style.height = "auto";
		elements.promptInput.style.height = `${Math.min(elements.promptInput.scrollHeight, 64)}px`;
	}

	function hideCommandMenu() {
		elements.commandMenu.hidden = true;
		state.commandMatches = [];
		state.commandIndex = 0;
	}

	function renderCommandMenu() {
		const value = elements.promptInput.value.trim().toLowerCase();
		if (!value.startsWith("/") || value.includes(" ")) {
			hideCommandMenu();
			return;
		}
		state.commandMatches = COMMANDS.filter((command) => command.name.startsWith(value));
		state.commandIndex = Math.min(state.commandIndex, Math.max(0, state.commandMatches.length - 1));
		elements.commandMenu.replaceChildren();
		for (const [index, command] of state.commandMatches.entries()) {
			const option = document.createElement("button");
			option.type = "button";
			option.className = `command-option${index === state.commandIndex ? " selected" : ""}`;
			option.setAttribute("role", "option");
			option.setAttribute("aria-selected", String(index === state.commandIndex));
			option.innerHTML = `<strong>${escapeHtml(command.name)}</strong><span>${escapeHtml(command.description)}</span>`;
			option.addEventListener("mousedown", (event) => event.preventDefault());
			option.addEventListener("click", () => {
				elements.promptInput.value = command.name;
				hideCommandMenu();
				elements.promptInput.focus({ preventScroll: true });
			});
			elements.commandMenu.append(option);
		}
		elements.commandMenu.hidden = state.commandMatches.length === 0;
	}

	function selectCommand(delta) {
		if (elements.commandMenu.hidden || state.commandMatches.length === 0) return false;
		state.commandIndex = (state.commandIndex + delta + state.commandMatches.length) % state.commandMatches.length;
		renderCommandMenu();
		return true;
	}

	function applySelectedCommand() {
		const command = state.commandMatches[state.commandIndex];
		if (!command) return false;
		elements.promptInput.value = command.name;
		hideCommandMenu();
		return true;
	}

	function cycleThinking() {
		const index = THINKING_LEVELS.indexOf(state.thinkingLevel);
		state.thinkingLevel = THINKING_LEVELS[(index + 1) % THINKING_LEVELS.length];
		updateHarnessState();
		addSystem("thinking", `Thinking time: ${state.thinkingLevel} (display-only).`);
	}

	function setActivityLevel(level) {
		state.activityLevel = level;
		state.activitySelectionPending = false;
		renderAllActivities();
		addSystem("activity", `Level ${level}: ${["compact", "headers", "collapsed detail", "full detail"][level - 1]}.`);
	}

	function toggleThinking() {
		state.thinkingVisible = !state.thinkingVisible;
		renderAllActivities();
		addSystem("thinking", `Thinking blocks ${state.thinkingVisible ? "shown" : "hidden"}.`);
	}

	function toggleTranscriptView() {
		state.transcriptView = state.transcriptView === "user" ? "model" : "user";
		elements.viewUser.textContent = state.transcriptView === "user" ? "USER" : "user";
		elements.viewModel.textContent = state.transcriptView === "model" ? "MODEL" : "model";
		elements.viewUser.classList.toggle("active", state.transcriptView === "user");
		elements.viewModel.classList.toggle("active", state.transcriptView === "model");
		for (const message of elements.transcript.querySelectorAll(".turn-assistant")) {
			const text = message.dataset.rawText || "";
			message.classList.toggle("model-view", state.transcriptView === "model");
			message.innerHTML = state.transcriptView === "model" ? escapeHtml(text) : paragraphMarkup(text);
		}
		renderAllActivities();
		addSystem("view", `${state.transcriptView} transcript view.`);
	}

	function cycleMemoryMode() {
		const index = MEMORY_MODES.indexOf(state.memoryMode);
		state.memoryMode = MEMORY_MODES[(index + 1) % MEMORY_MODES.length];
		state.allocation.memory = state.memoryMode === "none" ? 0 : state.memoryMode === "read" ? 590 : 720;
		updateHarnessState();
		addSystem("memory", `${memoryModeText()} mode. ${state.memoryMode === "none" ? "Memory tools removed from model context." : "Memory tools available."}`);
	}

	function applyCompactionBoundary() {
		const before = totalContextTokens();
		state.allocation.compact = Math.max(420, Math.round((state.allocation.chat + state.allocation.files) * 0.28));
		state.allocation.chat = 55;
		state.allocation.files = 0;
		state.files = [];
		const node = document.createElement("div");
		node.className = "compaction-line";
		node.innerHTML = `<strong>[compaction]</strong> Replaced earlier conversation and file payloads with a ${formatTokens(state.allocation.compact)} token summary. ${formatTokens(before)} tokens before compaction.`;
		appendTranscript(node);
		updateHarnessState();
	}

	function compactContext() {
		if (state.busy) {
			addSystem("compact", "Interrupt the active turn before compacting.", true);
			return;
		}
		applyCompactionBoundary();
	}

	function resetKashicodeSession(showMessage = true) {
		cancelAutoTour();
		state.runId += 1;
		clearTimerCollection(state.runTimers);
		setBusy(false);
		state.activityLevel = 3;
		state.activitySelectionPending = false;
		state.files = ["AGENTS.md"];
		state.skills = ["find-skills", "frontend-design", "repository-memory"];
		state.allocation = { ...INITIAL_ALLOCATION };
		if (state.memoryMode === "none") state.allocation.memory = 0;
		state.inputTokens = 0;
		state.outputTokens = 0;
		state.cacheReadTokens = 0;
		elements.transcript.replaceChildren();
		elements.promptInput.value = "";
		resizePrompt();
		hideCommandMenu();
		if (showMessage) addSystem("session", "New local session.");
		updateHarnessState();
	}

	function helpText() {
		return "Commands: `/tour`, `/clear`, `/new`, `/compact`, `/memory`, `/model`, `/about`, `/exit`. Keys: Ctrl+L model, Shift+Tab thinking time, Ctrl+R then 1–4 activity detail, Ctrl+T thinking visibility, Ctrl+X user/model view, Escape interrupt, Ctrl+C clear/interrupt, Ctrl+D exit. Prefix `!` for bash.";
	}

	function simulateBash(command) {
		addUser(`!${command}`);
		const output = command === "pwd"
			? "/Users/kashi/portfolio-lab"
			: command === "ls"
				? "AGENTS.md  README.md  package.json  packages  src  tests"
				: command === "git status"
					? "On branch main\nnothing to commit, working tree clean"
					: `zsh: command not found: ${command || "(empty)"}`;
		const step = {
			heading: "Running a shell command.",
			thinking: "User-prefixed bash bypasses the model response path but is still rendered into the session transcript.",
			thinkingTokens: 0,
			tools: [{ name: "bash", command, output }],
			files: [],
		};
		const activity = createActivity(step);
		completeActivity(activity, step);
	}

	function executeCommand(value) {
		const command = value.trim().split(/\s+/)[0];
		hideCommandMenu();
		switch (command) {
			case "/help":
				addSystem("help", helpText());
				break;
			case "/tour":
				addUser("Use some tools and skills to explain this repository.");
				void runScenario("tour");
				break;
			case "/clear":
				elements.transcript.replaceChildren();
				addSystem("clear", "Transcript cleared; context accounting remains active.");
				break;
			case "/new":
				resetKashicodeSession(true);
				break;
			case "/compact":
				compactContext();
				break;
			case "/memory":
				cycleMemoryMode();
				break;
			case "/model":
				openModelDialog();
				break;
			case "/about":
				addSystem("about", `Kashicode terminal ${DEMO_VERSION}.`);
				break;
			case "/exit":
				exitKashicode();
				break;
			default:
				addSystem("command", `Unknown command: ${command}. Run /help.`, true);
		}
	}

	function submitPrompt() {
		const value = elements.promptInput.value.trim();
		if (!value || state.busy) return;
		elements.promptInput.value = "";
		resizePrompt();
		hideCommandMenu();
		if (value.startsWith("/")) {
			executeCommand(value);
			return;
		}
		if (value.startsWith("!")) {
			simulateBash(value.slice(1).trim());
			return;
		}
		addUser(value);
		void runScenario(chooseScenario(value));
	}

	function renderModelDialog() {
		elements.modelOptions.replaceChildren();
		for (const [index, model] of MODEL_OPTIONS.entries()) {
			const option = document.createElement("button");
			option.type = "button";
			option.className = `model-option${index === state.modelDialogIndex ? " selected" : ""}`;
			option.innerHTML = `<span class="check">${index === state.modelIndex ? "●" : "○"}</span><span>${escapeHtml(model.id)}</span><span class="scope">${escapeHtml(model.scope)}</span>`;
			option.addEventListener("click", () => selectModel(index));
			elements.modelOptions.append(option);
		}
	}

	function openModelDialog() {
		state.modelDialogIndex = state.modelIndex;
		renderModelDialog();
		elements.modelDialog.hidden = false;
	}

	function closeModelDialog() {
		elements.modelDialog.hidden = true;
		if (state.mode === "kashicode") elements.promptInput.focus({ preventScroll: true });
	}

	function selectModel(index) {
		state.modelIndex = index;
		state.modelDialogIndex = index;
		const model = currentModel();
		closeModelDialog();
		updateHarnessState();
		addSystem("model", `${model.id} selected.`);
	}

	function handleModelDialogKey(event) {
		if (elements.modelDialog.hidden) return false;
		if (event.key === "Escape") {
			event.preventDefault();
			closeModelDialog();
			return true;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const delta = event.key === "ArrowDown" ? 1 : -1;
			state.modelDialogIndex = (state.modelDialogIndex + delta + MODEL_OPTIONS.length) % MODEL_OPTIONS.length;
			renderModelDialog();
			return true;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			selectModel(state.modelDialogIndex);
			return true;
		}
		return true;
	}

	elements.shellForm.addEventListener("submit", (event) => {
		event.preventDefault();
		cancelAutoBoot();
		executeShellCommand();
	});

	elements.shellInput.addEventListener("input", () => {
		if (state.autoTypingShell) cancelAutoBoot();
	});
	elements.shellInput.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		cancelAutoBoot();
		executeShellCommand();
	});

	elements.promptForm.addEventListener("submit", (event) => {
		event.preventDefault();
		submitPrompt();
	});

	elements.promptInput.addEventListener("input", () => {
		cancelAutoTour();
		resizePrompt();
		state.commandIndex = 0;
		renderCommandMenu();
	});

	elements.promptInput.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown" && selectCommand(1)) {
			event.preventDefault();
			return;
		}
		if (event.key === "ArrowUp" && selectCommand(-1)) {
			event.preventDefault();
			return;
		}
		if (event.key === "Tab" && !event.shiftKey && applySelectedCommand()) {
			event.preventDefault();
			return;
		}
		if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
			event.preventDefault();
			if (!elements.commandMenu.hidden) applySelectedCommand();
			submitPrompt();
		}
	});

	document.addEventListener("keydown", (event) => {
		if (state.mode !== "kashicode") return;
		if (handleModelDialogKey(event)) return;
		const key = event.key.toLowerCase();
		if (state.activitySelectionPending && /^[1-4]$/.test(event.key)) {
			event.preventDefault();
			setActivityLevel(Number(event.key));
			return;
		}
		if (event.key === "Escape") {
			if (!elements.commandMenu.hidden) hideCommandMenu();
			else interrupt(true);
			return;
		}
		if (event.shiftKey && event.key === "Tab") {
			event.preventDefault();
			cycleThinking();
			return;
		}
		if (event.ctrlKey && key === "l") {
			event.preventDefault();
			openModelDialog();
			return;
		}
		if (event.ctrlKey && key === "r") {
			event.preventDefault();
			state.activitySelectionPending = true;
			addSystem("activity", "Select detail level 1–4.");
			return;
		}
		if (event.ctrlKey && key === "t") {
			event.preventDefault();
			toggleThinking();
			return;
		}
		if (event.ctrlKey && key === "x") {
			event.preventDefault();
			toggleTranscriptView();
			return;
		}
		if (event.ctrlKey && key === "c") {
			event.preventDefault();
			if (state.busy) {
				interrupt(true);
				return;
			}
			if (elements.promptInput.value) {
				elements.promptInput.value = "";
				resizePrompt();
				hideCommandMenu();
				return;
			}
			const now = Date.now();
			if (now - state.lastCtrlC < 800) exitKashicode();
			state.lastCtrlC = now;
			return;
		}
		if (event.ctrlKey && key === "d" && !elements.promptInput.value) {
			event.preventDefault();
			exitKashicode();
		}
	}, true);

	elements.latestButton.addEventListener("click", () => scrollTranscript(true));
	elements.transcript.addEventListener("scroll", () => {
		elements.latestButton.hidden = nearTranscriptBottom();
	});
	elements.viewToggle.addEventListener("click", toggleTranscriptView);
	window.addEventListener("resize", updateTerminalTitle);

	updateHarnessState();
	updateTerminalTitle();
	elements.shellInput.focus({ preventScroll: true });
	beginShellBoot();
})();
