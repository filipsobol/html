import { describe, expect, test } from "bun:test";
import { parseDocument } from "htmlparser2";

import * as tree from "./tree";
import * as values from "./values";

import type { ChildNode } from "domhandler";

const CASES: Record<string, string> = {
	empty: "",
	"text only": "hello &amp; world",
	"basic document":
		"<!doctype html><html><head><title>Hi</title></head><body><p>x</p></body></html>",
	"uppercase tags": "<DIV ID=a><SPAN>x</SPAN></DIV>",
	"attributes, quoted": `<a href="x" title='y' data-z=z>t</a>`,
	"attributes, no value": "<input disabled checked>",
	"attributes, duplicates": `<a href="first" href="second">t</a>`,
	"attributes, mixed case": `<meta charSet="utf-8" ConTent=x>`,
	"attributes, entities": `<a href="?a=1&amp;b=2&lt;" title="&quot;q&quot;">t</a>`,
	"attributes, '>' in quotes": `<div title="a>b" data-x='c>d'>x</div>`,
	"attributes, unquoted slash": "<a href=/x/>t</a>",
	"attributes, newlines": `<a\n  href="x"\n  class="y"\n>t</a>`,
	"attributes, doubled quote": `<a href="/x"">link</a><p>Hello</p>`,
	"attributes, doubled single quote": `<a b='c''>x</a><p>y</p>`,
	"attributes, quote in name": `<div data-x"y>one</div><p>Hello</p><span z">two</span>`,
	"attributes, quote in unquoted value": `<div class=a"b>one</div><p>Hello</p><span title="t">two</span>`,
	"attributes, apostrophe in unquoted value": "<a b=c'd e=f>x</a>",
	"attributes, leading equals": "<a =b c>x</a>",
	"attributes, slash between": `<a b = "c" / d>x</a>`,
	"attributes, quote after value": `<a b="c"d e>x</a>`,
	"attributes, empty unquoted": "<a b= >x</a><a c=>y</a>",
	"self-closing svg, unquoted slash": "<svg><path d=M0/><path d=M1/></svg>",
	"self-closing svg, spaced slash": "<svg><path d=M0 / ><path/></svg>",
	"self-closing svg, quoted slash": `<svg><path d="M0/"/><path/></svg>`,
	"self-closing html": "<div/><span>x</span>",
	"void elements": "<p>a<br>b<img src=x>c<hr>d</p>",
	"implied p close": "<p>one<p>two<div>three</div>",
	"implied li close": "<ul><li>a<li>b</ul>",
	"implied table": "<table><tr><td>a<td>b<tr><td>c</table>",
	"implied option": "<select><option>a<option>b<optgroup><option>c</select>",
	"implied dd/dt": "<dl><dt>a<dd>b<dt>c</dl>",
	"implied heading": "<h1>a<h2>b</h2>",
	"implied a": "<a href=1>one<a href=2>two</a>",
	"body closes head": "<html><head><link rel=x><body>y</body>",
	"stray close p": "<div></p></div>",
	"stray close br": "<div></br></div>",
	"stray close tag": "<div></span>x</div>",
	"unclosed elements": "<div><span>x",
	misnested: "<b><i>x</b>y</i>",
	"nested form": "<form><form><input></form></form>",
	comment: "<!-- hi --><p>x</p>",
	"comment, unclosed": "<p>x<!-- never",
	"bogus comment": "<p>x</ 3>y</p>",
	"processing instruction": "<?xml version=1?><p>x</p>",
	directive: "<!DOCTYPE html><p>x</p>",
	"script, raw": `<script>if (a < b && c > d) document.write("<p>x</p>")</script>`,
	"script, uppercase close": "<script>x</SCRIPT>y",
	"script, unclosed": "<script>x<p>y",
	"style, raw": "<style>a > b { content: '&amp;' }</style>",
	"title, entities": "<title>a &amp; b <i>c</i></title>",
	textarea: "<textarea><b>&lt;x&gt;</b></textarea>",
	plaintext: "<plaintext><b>x</b></plaintext>",
	noscript: "<noscript><img src=x></noscript>",
	"lone <": "<p>a < b and c <3 d</p>",
	"text entities": "<p>&copy; &#169; &#xA9; &nbsp;&notanentity; &amp</p>",
	"svg names":
		"<svg viewBox='0 0 1 1'><clipPath id=c><rect/></clipPath><foreignObject><div>x</div></foreignObject></svg>",
	"svg self-closing": "<svg/><p>x</p>",
	"svg title": "<svg><title><b>x</b></title></svg>",
	math: "<math><mi>x</mi><mo>+</mo></math>",
	"image alias": "<image src=x>",
	whitespace: "\n  <div>\n\t<span> x </span>\n  </div>\n",
	"bogus comments": "<!x><!><!-x><![CDATA[x]]><?x?></ x>",
	doctypes: "<!doctype html><!DOCTYPE html><!DocType x>",
	"empty end tag": "<p>a</>b</p>",
	"cdata in svg": "<svg><style><![CDATA[a&amp;<b>]]></style></svg>",
	"eof in start tag": '<p>a<a href="x',
	"eof in unquoted value": "<p>a<a b=c",
	"eof in attribute name": "<p>a<a b",
	"eof in end tag": "<p>a</p",
	"eof after end tag open": "<p>a</",
	"eof after lone <": "<p>a<",
	"eof in bogus comment": "<p>a</ x",
	"eof in declaration": "<p>a<!x",
	"eof in raw text end tag": "<script>a</script",
	"eof in rcdata end tag": "<title>a</title",
};

/** Inputs where htmlparser2 keeps part of an unfinished tag, and browsers drop it. */
const BROWSER: Record<string, string> = {
	"<p>a<a/": "p(a)",
	"<p>a</p x": "p(a)",
	"<p>a</p ": "p(a)",
	"<script>a</script x": "script(a)",
	"<script>a</script/": "script(a)",
	"<textarea>a</textarea ": "textarea(a)",
};

type Line = [depth: number, kind: string, detail: string];

function theirs(html: string): Line[] {
	let output: Line[] = [];
	let walk = (nodes: ChildNode[], depth: number): void => {
		for (let node of nodes) {
			if (
				node.type === "tag" ||
				node.type === "script" ||
				node.type === "style"
			) {
				output.push([
					depth,
					"element",
					node.name + " " + JSON.stringify(node.attribs),
				]);
				walk(node.children, depth + 1);
			} else if (node.type === "text") {
				let last = output.at(-1);
				if (last && last[0] === depth && last[1] === "text")
					last[2] += node.data;
				else output.push([depth, "text", node.data]);
			} else if (node.type === "comment") {
				output.push([depth, "comment", ""]);
			} else if (node.type === "directive") {
				output.push([depth, "directive", ""]);
			}
		}
	};
	walk(parseDocument(html).children, 0);
	return output;
}

function ours(html: string): Line[] {
	let t = tree.build(html);
	let depth = [-1];
	let output: Line[] = [];
	for (let id = 1; id < t.kind.length; id++) {
		let d = depth[t.parent[id]] + 1;
		depth[id] = d;
		let kind = t.kind[id];
		if (kind === tree.ELEMENT) {
			output.push([
				d,
				"element",
				t.name[id] + " " + JSON.stringify(values.attributes(t, id)),
			]);
		} else if (kind === tree.TEXT) {
			let last = output.at(-1);
			if (last && last[0] === d && last[1] === "text")
				last[2] += values.value(t, id);
			else output.push([d, "text", values.value(t, id)]);
		} else {
			output.push([d, kind === tree.COMMENT ? "comment" : "directive", ""]);
		}
	}
	return output;
}

describe("build()", () => {
	for (let [name, html] of Object.entries(CASES)) {
		test(`matches htmlparser2 :: ${name}`, () => {
			expect(ours(html)).toEqual(theirs(html));
		});
	}

	for (let [html, expected] of Object.entries(BROWSER)) {
		test(`drops unfinished tags like browsers :: ${html}`, () => {
			let t = tree.build(html);
			let shape = (id: number): string => {
				if (t.kind[id] === tree.TEXT) return values.value(t, id);
				let inner: string[] = [];
				for (let x = id + 1; x < t.stop[id]; x = t.stop[x])
					inner.push(shape(x));
				return `${t.name[id]}(${inner.join(",")})`;
			};
			let top: string[] = [];
			for (let x = 1; x < t.kind.length; x = t.stop[x]) top.push(shape(x));
			expect(top.join(",")).toBe(expected);
		});
	}

	test("comment, directive, and CDATA values follow browsers", () => {
		let t = tree.build(
			"<!x><?x?><!DOCTYPE html><![CDATA[c]]><svg><![CDATA[a&amp;<b>]]></svg>",
		);
		let list = [];
		for (let id = 1; id < t.kind.length; id++) {
			if (t.kind[id] !== tree.ELEMENT)
				list.push([t.kind[id], values.value(t, id)]);
		}
		expect(list).toEqual([
			[tree.COMMENT, "x"],
			[tree.COMMENT, "?x?"],
			[tree.DIRECTIVE, "DOCTYPE html"],
			[tree.COMMENT, "[CDATA[c]]"],
			[tree.TEXT, "a&amp;<b>"],
		]);
	});

	test("element ranges point at their source", () => {
		for (let html of Object.values(CASES)) {
			let t = tree.build(html);
			for (let id = 1; id < t.kind.length; id++) {
				let outer = html.slice(t.start[id], t.end[id]);
				if (t.kind[id] === tree.ELEMENT) {
					expect(outer[0]).toBe("<");
					expect(t.start[id] <= t.from[id]).toBe(true);
					expect(t.from[id] <= t.to[id]).toBe(true);
					expect(t.to[id] <= t.end[id]).toBe(true);
				}
				if (t.kind[id] === tree.TEXT) {
					let inner = html.slice(t.from[id], t.to[id]);
					if (outer !== inner) expect(outer).toBe(`<![CDATA[${inner}]]>`);
				}
			}
		}
	});

	let spellings = (name: string) => [
		name,
		name.toLowerCase(),
		name.toUpperCase(),
		[...name].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join(""),
	];

	let shape = (t: tree.Tree, id: number): string => {
		if (t.kind[id] === tree.TEXT) return JSON.stringify(values.value(t, id));
		if (t.kind[id] !== tree.ELEMENT) return "#";
		let inner: string[] = [];
		for (let x = id + 1; x < t.stop[id]; x = t.stop[x]) inner.push(shape(t, x));
		return `${t.name[id]}(${inner.join(",")})`;
	};

	let top = (html: string, foreign?: boolean): string => {
		let t = tree.build(html, foreign);
		let output: string[] = [];
		for (let x = 1; x < t.kind.length; x = t.stop[x]) output.push(shape(t, x));
		return output.join(",");
	};

	test("void elements ignore case, in start and end tags", () => {
		for (let name of tree.VOID) {
			for (let spelling of spellings(name)) {
				expect(top(`<div><${spelling} a=1>x</div>`)).toBe(`div(${name}(),"x")`);
				let end = name === "br" ? "br()," : "";
				expect(top(`<div></${spelling}>x</div>`)).toBe(`div(${end}"x")`);
			}
		}
	});

	test("raw text elements ignore case, outside foreign content", () => {
		for (let name of tree.RAW) {
			for (let spelling of spellings(name)) {
				let html = `<${spelling}><b>&amp;</${spelling}><i>`;
				let text = values.LITERAL.has(name) ? "<b>&amp;" : "<b>&";
				let rest = name === "plaintext" ? `${text}</${spelling}><i>` : text;
				let after = name === "plaintext" ? "" : ",i()";
				expect(top(html)).toBe(`${name}(${JSON.stringify(rest)})${after}`);
				expect(top(`<svg>${html}`)).toBe(`svg(${name}(b("&")),i())`);
			}
		}
	});

	test("implied end tags ignore case", () => {
		expect(top("<UL><LI>a<Li>b</UL>")).toBe('ul(li("a"),li("b"))');
		expect(top("<P>a<DIV>b</DIV>")).toBe('p("a"),div("b")');
		expect(top("<TABLE><TR><TD>a<TD>b<TR><TH>c</TABLE>")).toBe(
			'table(tr(td("a"),td("b")),tr(th("c")))',
		);
		expect(top("<SELECT><OPTION>a<OPTGROUP><OPTION>b</SELECT>")).toBe(
			'select(option("a"),optgroup(option("b")))',
		);
		expect(top("<FORM><Form><INPUT></FORM>")).toBe("form(input())");
		expect(top("<H1>a<h2>b")).toBe('h1("a"),h2("b")');
	});

	test("foreign and integration elements ignore case", () => {
		for (let name of ["svg", "math"]) {
			for (let spelling of spellings(name)) {
				expect(top(`<${spelling}><path/>x</${spelling}>`)).toBe(`${name}(path(),"x")`);
				expect(top(`<${spelling}/><p>x`)).toBe(`${name}(),p("x")`);
			}
		}
		for (let name of ["mi", "mo", "mn", "ms", "mtext", "annotation-xml"]) {
			for (let spelling of spellings(name)) {
				expect(top(`<math><${spelling}><b/>x</${spelling}></math>`)).toBe(
					`math(${name}(b("x")))`,
				);
			}
		}
		for (let spelling of spellings("foreignObject")) {
			expect(top(`<svg><${spelling}><b/>x</svg><b/>y`)).toBe(
				'svg(foreignObject(b("x"))),b("y")',
			);
		}
		for (let spelling of spellings("desc")) {
			expect(top(`<svg><${spelling}><b/>x</${spelling}></svg>`)).toBe('svg(desc(b("x")))');
		}
	});

	test("SVG names keep their case only in foreign content", () => {
		for (let [lower, name] of tree.SVG) {
			for (let spelling of spellings(name)) {
				expect(top(`<svg><${spelling}></${spelling}></svg>`)).toBe(`svg(${name}())`);
				expect(top(`<${spelling}></${spelling}>`)).toBe(`${lower}()`);
				expect(top(`<${spelling}/>`, true)).toBe(`${name}()`);
			}
		}
	});

	test("image is img outside foreign content", () => {
		for (let spelling of spellings("image")) {
			expect(top(`<p><${spelling} src=x>a`)).toBe('p(img(),"a")');
			expect(top(`<svg><${spelling} href=x />a</svg>`)).toBe('svg(image(),"a")');
			expect(top(`<p></${spelling}>a`)).toBe('p("a")');
		}
	});

	test("unknown and custom names have no flags", () => {
		for (let name of ["x-br", "brr", "scripts", "c-code-block", "svgx", "imgs", "my-p"]) {
			for (let spelling of spellings(name)) {
				expect(top(`<${spelling}><p>a</${spelling}>b`)).toBe(`${name}(p("a")),"b"`);
			}
		}
	});

	let columns = (t: tree.Tree) =>
		JSON.stringify([
			t.name,
			...[t.kind, t.parent, t.stop, t.start, t.end, t.from, t.to, t.head].map(
				(x) => Array.from(x),
			),
		]);

	/** Inputs of every size, from empty to more nodes than the parser keeps room for. */
	let sizes = () => [
		"",
		"x",
		"<p>",
		"<b>".repeat(100_000),
		"<p>a</p>".repeat(5_000),
		"x".repeat(2_000_000),
		...Object.values(CASES),
	];

	test("builds the same tree after any other build", () => {
		let list = sizes();
		let expected = list.map((html) => columns(tree.build(html)));
		for (let i = 0; i < list.length; i++) {
			for (let j of [0, 3, 4, 5, i + 1]) {
				if (j >= list.length) continue;
				tree.build(list[j]);
				expect(columns(tree.build(list[i]))).toBe(expected[i]);
				expect(columns(tree.build(list[i], true))).toBe(columns(tree.build(list[i], true)));
			}
		}
	});

	test("trees never share or change their columns", () => {
		let list = sizes();
		let trees = list.map((html) => tree.build(html));
		let before = trees.map(columns);
		for (let html of list) tree.build(html);
		expect(trees.map(columns)).toEqual(before);
		let buffers = new Set(trees.map((t) => t.kind.buffer));
		expect(buffers.size).toBe(trees.length);
		for (let t of trees) {
			for (let column of [t.parent, t.stop, t.start, t.end, t.from, t.to, t.head]) {
				expect(column.buffer).toBe(t.kind.buffer);
				expect(column.length).toBe(t.kind.length);
			}
		}
	});

	test("columns are exact for empty and huge inputs", () => {
		let empty = tree.build("");
		expect(columns(empty)).toBe(JSON.stringify([[""], [0], [-1], [1], [0], [0], [0], [0], [0]]));
		let html = "<b>".repeat(100_000);
		let t = tree.build(html);
		expect(t.kind.length).toBe(100_001);
		for (let id = 1; id < t.kind.length; id++) {
			if (t.kind[id] !== tree.ELEMENT || t.parent[id] !== id - 1) throw new Error(`node ${id}`);
			if (t.start[id] !== 3 * (id - 1) || t.from[id] !== 3 * id || t.end[id] !== html.length) {
				throw new Error(`range ${id}`);
			}
			if (t.stop[id] !== t.kind.length || t.head[id] !== 3 * id - 1) throw new Error(`stop ${id}`);
		}
	});

	test("builds nested in a build, like from a patched String method, get their own columns", () => {
		let outer = "<b>".repeat(2_000) + Object.values(CASES).join("");
		let inner = ["<p>a<p>b", "<b>".repeat(5_000), "", outer.slice(0, 500)];
		let expected = columns(tree.build(outer));
		let nested = inner.map((html) => columns(tree.build(html)));
		let indexOf = String.prototype.indexOf;
		let calls = 0;
		let results: string[] = [];
		String.prototype.indexOf = function (this: string, ...args: [string, number?]) {
			if (this === outer && args[0] === "<" && [1, 50, 400, 1_500].includes(++calls)) {
				results.push(columns(tree.build(inner[results.length])));
			}
			return indexOf.apply(this, args);
		};
		let actual: string;
		try {
			actual = columns(tree.build(outer));
		} finally {
			String.prototype.indexOf = indexOf;
		}
		expect(results).toHaveLength(nested.length);
		expect(results.every((x, i) => x === nested[i])).toBe(true);
		expect(actual === expected).toBe(true);
	});

	test("subtrees are contiguous", () => {
		for (let html of Object.values(CASES)) {
			let t = tree.build(html);
			for (let id = 1; id < t.kind.length; id++) {
				for (let x = id + 1; x < t.stop[id]; x++) {
					let p = t.parent[x];
					while (p > id) p = t.parent[p];
					expect(p).toBe(id);
				}
			}
		}
	});
});
