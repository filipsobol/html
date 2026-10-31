import { describe, expect, test } from "bun:test";
import { selectAll } from "css-select";
import { parseDocument } from "htmlparser2";

import * as select from "./select";
import * as tree from "./tree";
import * as values from "./values";

const HTML = `<!doctype html>
<html lang="en-US">
<head>
	<title>Fixture</title>
	<meta name="description" content="A page">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<link rel="canonical" href="https://example.com/">
	<link rel="stylesheet alternate" href="/a.css">
</head>
<body class="home page">
	<header id="top"><nav><a href="/">Home</a><a href="/about/" class="active">About</a></nav></header>
	<main>
		<h1>Title</h1>
		<p class="lead intro">One <a href="https://other.com" target="_blank" rel="noopener">ext</a></p>
		<p>Two <img src="a.png" alt="A"><img src="b.png"></p>
		<p></p>
		<ul><li>1</li><li class="x">2</li><li>3</li><li>4</li><li class="x">5</li></ul>
		<div data-Mixed="Value" data-list="a b c" lang="en-GB"><span>s</span><!-- c --></div>
		<svg viewBox="0 0 1 1"><clipPath id="c"><rect/></clipPath></svg>
		<template id="t"><p class="x">t</p><template><li class="x">n</li></template></template>
	</main>
	<footer><p>Bye</p></footer>
</body>
</html>`;

const SELECTORS = [
	"*",
	"a",
	"A",
	"head > title",
	"head>title",
	"meta[name=description]",
	'meta[name="viewport"]',
	"link[rel=canonical]",
	"link[rel~=alternate]",
	"html[lang|=en]",
	"[lang|=en]",
	"a[href^=https]",
	'a[href$="/"]',
	"a[href*=other]",
	"[data-mixed=value i]",
	"[data-mixed=Value]",
	"[data-list~=b]",
	"img[alt]",
	"img:not([alt])",
	"#top",
	"#top a",
	".active",
	"p.lead.intro",
	".lead, .active",
	"body.home",
	"main > p",
	"main p",
	"h1 + p",
	"h1 ~ p",
	"p + p",
	"li:first-child",
	"li:last-child",
	"li:nth-child(2n+1)",
	"li:nth-child(odd)",
	"li:nth-child(even)",
	"li:nth-child(3)",
	"li:nth-child(-n+2)",
	"li:nth-last-child(2)",
	"li.x:nth-of-type(2)",
	"p:first-of-type",
	"p:last-of-type",
	"span:only-child",
	"p:empty",
	":root",
	"li:not(.x)",
	"li:not(:first-child):not(:last-child)",
	":is(h1, footer p)",
	":where(nav) a",
	"svg rect",
	"ul > li.x + li",
	"header a.active, main img[src$='.png']",
	"template",
	"template p",
	"main .x",
	"p, li",
];

const ATTRIBUTES = `<div id=d1 data-v="foo bar" lang="en-US" title='a"b' data-e="&lt;&amp;" DATA-MIXED="Value" data-empty="" data-bare></div>
<div id=d2 data-v="foobar" Lang=en data-x=unq/uoted data-q='>' data-lt="<p>" data-gt=a>b</div>
<div id=d3 data-v=" foo " lang="EN-us" data-dup="1" data-DUP="2" data-dup=3></div>
<svg id=s1 viewBox="0 0 1 1"><clipPath id=c1 clipPathUnits=userSpaceOnUse></clipPath></svg>`;

/** Each selector and the `id` of every element it matches. */
const OPERATORS: Record<string, string[]> = {
	"[data-v]": ["d1", "d2", "d3"],
	"[data-v=foobar]": ["d2"],
	'[data-v="foo bar"]': ["d1"],
	"[data-v='foo bar']": ["d1"],
	"[data-v~=foo]": ["d1", "d3"],
	"[data-v~=bar]": ["d1"],
	'[data-v~="foo bar"]': [],
	"[data-v~='']": [],
	"[data-v^=foo]": ["d1", "d2"],
	"[data-v^=' ']": ["d3"],
	"[data-v^='']": [],
	"[data-v$=bar]": ["d1", "d2"],
	"[data-v$='']": [],
	'[data-v*="o b"]': ["d1"],
	"[data-v*=oo]": ["d1", "d2", "d3"],
	"[data-v*='']": [],
	"[lang|=en]": ["d1", "d2"],
	"[lang|=EN]": ["d3"],
	"[lang|=en i]": ["d1", "d2", "d3"],
	'[lang="en-us" i]': ["d1", "d3"],
	'[lang="en-us" s]': [],
	'[lang="en-US" s]': ["d1"],
	"[LANG=en]": ["d2"],
	"[DATA-MIXED=Value]": ["d1"],
	"[data-mixed=value]": [],
	"[data-mixed=VALUE i]": ["d1"],
	"[data-mixed^=VA i]": ["d1"],
	'[data-e="<&"]': ["d1"],
	'[data-e="&lt;&amp;"]': [],
	"[title='a\"b']": ["d1"],
	"[data-empty]": ["d1"],
	'[data-empty=""]': ["d1"],
	"[data-bare='']": ["d1"],
	"[data-bare|='']": ["d1"],
	'[data-x="unq/uoted"]': ["d2"],
	"[data-q='>']": ["d2"],
	'[data-lt="<p>"]': ["d2"],
	"[data-gt=a]": ["d2"],
	"[b]": [],
	"[data-dup=1]": ["d3"],
	"[data-dup=2]": [],
	"[data-dup=3]": [],
	"[ data-v = foobar ]": ["d2"],
	"#d1[data-bare][data-empty]": ["d1"],
	"div:not([data-v^=foo])": ["d3"],
	"[viewbox]": ["s1"],
	"[viewBox='0 0 1 1']": ["s1"],
	"[clippathunits=userSpaceOnUse]": ["c1"],
	"[CLIPPATHUNITS=userspaceonuse i]": ["c1"],
	"svg [id]": ["c1"],
	"[id^=d][id$='2']": ["d2"],
};

const CLASSES = `<p id=p1 class="foo"></p><p id=p2 class="foobar"></p>
<p id=p3 class="a-foo foo-b"></p><p id=p4 class="\tfoo\n"></p>
<p id=p5 class="x\fFOO foo foo"></p><p id=p6 class=""></p><p id=p7 class></p>
<p id=p8 CLASS="bar" class="foo"></p><p id=p9 class="foo&#9;bar"></p>
<p id=p10 class="foo&nbsp;bar"></p><p id=p11 class="a b"></p><p id=p12 class=Foo></p>
<p id=p13 class=" \r\nfoo\u2028bar\u3000 "></p><p id=p14 class="foo\u00adbar"></p>`;

/** Each class selector and the `id` of every element it matches. */
const TOKENS: Record<string, string[]> = {
	".foo": ["p1", "p4", "p5", "p9", "p10", "p13"],
	".foobar": ["p2"],
	".oo": [],
	".fo": [],
	".a-foo": ["p3"],
	".foo-b": ["p3"],
	".FOO": ["p5"],
	".Foo": ["p12"],
	".bar": ["p8", "p9", "p10", "p13"],
	".foo.bar": ["p9", "p10", "p13"],
	".foo.foo": ["p1", "p4", "p5", "p9", "p10", "p13"],
	".x.FOO.foo": ["p5"],
	".a": ["p11"],
	".a\\ b": [],
	".a\\20 b": [],
	".\\66 oo": ["p1", "p4", "p5", "p9", "p10", "p13"],
	".foo\\ad bar": ["p14"],
	"[class~=foo]": ["p1", "p4", "p5", "p9", "p10", "p13"],
	"[class~=foo i]": ["p1", "p4", "p5", "p9", "p10", "p12", "p13"],
	'[class~="a b"]': [],
	'[class="a b"]': ["p11"],
	"[class='']": ["p6", "p7"],
	"[class]:not(.foo)": ["p2", "p3", "p6", "p7", "p8", "p11", "p12", "p14"],
	"p:not([class])": [],
};

/** A seeded generator, so failures repeat. */
function random(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

describe("token()", () => {
	let split = (list: string, name: string) => list.split(/\s+/).includes(name);

	test("splits on every code unit like /\\s+/", () => {
		for (let c = 0; c < 0x10000; c++) {
			let ch = String.fromCharCode(c);
			for (let list of [`a${ch}b`, `${ch}b`, `b${ch}`, `${ch}`, `${ch}${ch}b${ch}`]) {
				for (let name of ["b", "a", ch, `a${ch}b`, `${ch}b`]) {
					if (select.token(list, name) !== split(list, name)) {
						throw new Error(`token(${JSON.stringify(list)}, ${JSON.stringify(name)})`);
					}
				}
			}
		}
	});

	test("matches split() on random lists", () => {
		let next = random(7);
		let parts = ["a", "b", "ab", "-", "a-b", " ", "\t", "\n", "\f", "\r", "\v", "\u00a0", "\u2028", "\u3000", "\ufeff", "\u200b", "\ud83d\ude00", "\ud83d"];
		let pick = (count: number) => {
			let output = "";
			for (let i = 0; i < count; i++) output += parts[Math.floor(next() * parts.length)];
			return output;
		};
		for (let n = 0; n < 20000; n++) {
			let list = pick(Math.floor(next() * 8));
			let name = pick(1 + Math.floor(next() * 3));
			expect(select.token(list, name)).toBe(split(list, name));
		}
	});
});

describe("select", () => {
	let ours = tree.build(HTML);
	let theirs = parseDocument(HTML, { withStartIndices: true });

	for (let selector of SELECTORS) {
		test(`matches css-select :: ${selector}`, () => {
			let expected = selectAll(selector, theirs).map((x) => x.startIndex ?? -1);
			let actual = select
				.all(ours, 0, select.compile(selector))
				.map((id) => ours.start[id]);
			expect(actual).toEqual(expected);
		});
	}

	for (let [selector, expected] of Object.entries(OPERATORS)) {
		test(`matches attributes :: ${selector}`, () => {
			let t = tree.build(ATTRIBUTES);
			let ids = select
				.all(t, 0, select.compile(selector))
				.map((id) => values.attribute(t, id, "id"));
			expect(ids).toEqual(expected);
			// The same once the attributes are parsed and cached.
			for (let id = 1; id < t.kind.length; id++) values.pairs(t, id);
			let again = select
				.all(t, 0, select.compile(selector))
				.map((id) => values.attribute(t, id, "id"));
			expect(again).toEqual(expected);
		});
	}

	for (let [selector, expected] of Object.entries(TOKENS)) {
		test(`matches class tokens :: ${selector}`, () => {
			let t = tree.build(CLASSES);
			let ids = select
				.all(t, 0, select.compile(selector))
				.map((id) => values.attribute(t, id, "id"));
			expect(ids).toEqual(expected);
		});
	}

	test("scopes results to the root", () => {
		let main = select.all(ours, 0, select.compile("main"))[0];
		let inside = select.all(ours, main, select.compile("p"));
		let everywhere = select.all(ours, 0, select.compile("p"));
		expect(inside).toHaveLength(3);
		expect(everywhere).toHaveLength(4);
	});

	test("matches foreign tags by exact case, like browsers", () => {
		let exact = select.all(ours, 0, select.compile("clipPath"));
		let lower = select.all(ours, 0, select.compile("clippath"));
		expect(exact.map((id) => ours.name[id])).toEqual(["clipPath"]);
		expect(lower).toEqual([]);
	});

	test("skips template contents, unless the template is the root", () => {
		let [outer] = select.all(ours, 0, select.compile("template"));
		let [inner] = select.all(ours, outer, select.compile("template"));
		let names = (root: number) =>
			select.all(ours, root, select.compile(".x")).map((id) => ours.name[id]);
		expect(names(outer)).toEqual(["p"]);
		expect(names(inner)).toEqual(["li"]);
		expect(select.all(ours, outer, select.compile("li"))).toEqual([]);
	});

	test("stops at the limit", () => {
		expect(select.all(ours, 0, select.compile("li"), 2)).toHaveLength(2);
	});

	test("supports escapes in identifiers and strings", () => {
		let doc = tree.build(`<a id="a:b" class="1x" title='say "hi"'></a>`);
		for (let selector of ["#a\\:b", ".\\31 x", '[title="say \\"hi\\""]']) {
			expect(select.all(doc, 0, select.compile(selector))).toHaveLength(1);
		}
	});

	test("rejects an unterminated string", () => {
		expect(() => select.compile('[title="x]')).toThrow(SyntaxError);
	});

	test("ignores inherited object keys as attributes", () => {
		for (let selector of ["[constructor]", "[toString]", "[__proto__]"]) {
			expect(select.all(ours, 0, select.compile(selector))).toEqual([]);
		}
	});

	test("caches compiled selectors", () => {
		expect(select.compile("a > b")).toBe(select.compile("a > b"));
	});

	for (let bad of [
		"",
		"a >",
		"[href",
		"a:hover",
		":nth-child(x)",
		"a,,b",
		"'x'",
	]) {
		test(`rejects invalid selector :: ${JSON.stringify(bad)}`, () => {
			expect(() => select.compile(bad)).toThrow(SyntaxError);
		});
	}
});
