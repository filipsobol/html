import { describe, expect, test } from "bun:test";

import * as tree from "./tree";
import * as values from "./values";

const HEADS = [
	"",
	" a",
	" A=1 a=2",
	` href="/x" title='y' data-z=z hidden`,
	" a = 1  b= '2'  c =\"3\"",
	" a=/x/",
	" a= ",
	" a=",
	` a="x>y" b`,
	` "a" 'b' c`,
	" a\tb\nc\fd\re",
	" =a b",
	" a/b c",
	` a=1"2 b`,
	" a=&amp;b c=&copy;",
	" İ=1 i=2",
	" \u212A=1 k=2",
	" ÄB=1 äb=2",
	` a="x" A="y" a='z'`,
	` a="<b>" c='>' d="'" e='"'`,
	` a="&quot;x&quot;" b=&lt;&gt; c="&amp;amp;"`,
	" a=b=c d==e",
	" a\u00a0b=1",
];

/** Keys to look up beyond the parsed ones: absent, mixed case, and special. */
const KEYS = ["", "x", "a=", "İ", "i̇", "k", "\u212A", "Ä", "__proto__", "constructor"];

/** A seeded generator, so failures repeat. */
function random(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

describe("spans", () => {
	test("finds the same attributes as pairs", () => {
		for (let head of HEADS) {
			for (let close of [">", "/>", " />"]) {
				let t = tree.build(`<x${head}${close}</x>`);
				let pairs = values.pairs(t, 1);
				let spans = values.spans(t, 1);
				let keys = (list: string[], stride: number) =>
					list.filter((_, i) => i % stride === 0);
				expect(keys(spans, 3)).toEqual(keys(pairs, 2));
				for (let i = 0; i < spans.length; i += 3) {
					expect(t.source).toContain(spans[i + 2]);
					expect(spans[i + 2].startsWith(spans[i + 1])).toBe(true);
				}
			}
		}
	});
});

describe("lookup", () => {
	let check = (html: string) => {
		let parsed = tree.build(html);
		let fresh = tree.build(html);
		for (let id = 1; id < parsed.kind.length; id++) {
			if (parsed.kind[id] !== tree.ELEMENT) continue;
			let list = values.pairs(parsed, id);
			let keys = list.filter((_, i) => i % 2 === 0);
			for (let key of [...keys, ...keys.map((x) => x.toUpperCase()), ...KEYS]) {
				let expected = values.attribute(parsed, id, key);
				expect(values.lookup(fresh, id, key)).toBe(expected);
				expect(values.lookup(parsed, id, key)).toBe(expected);
			}
			expect(fresh.pairs[id]).toBeUndefined();
		}
	};

	test("finds the same values as pairs", () => {
		for (let head of HEADS) {
			for (let close of [">", "/>", " />"]) check(`<x${head}${close}</x>`);
		}
	});

	test("finds the first of duplicate names, ignoring case", () => {
		let t = tree.build(`<x A="1" a="2" B b="3">`);
		expect(values.lookup(t, 1, "a")).toBe("1");
		expect(values.lookup(t, 1, "b")).toBe("");
		expect(values.lookup(t, 1, "A")).toBeUndefined();
	});

	test("decodes only entity values", () => {
		let t = tree.build(`<x a="&amp;&lt;" b=&quot;x c='&notit;'>`);
		expect(values.lookup(t, 1, "a")).toBe("&<");
		expect(values.lookup(t, 1, "b")).toBe('"x');
		expect(values.lookup(t, 1, "c")).toBe(values.attribute(t, 1, "c"));
	});

	test("reads nothing for end tags parsed as elements", () => {
		let t = tree.build("</br></p>");
		expect(values.lookup(t, 1, "br")).toBeUndefined();
		expect(values.lookup(t, 2, "p")).toBeUndefined();
	});

	test("finds the same values as pairs in random tags", () => {
		let next = random(1);
		let parts = ["a", "A", "b", "İ", "\u212A", "=", " ", "\t", "\n", "/", '"', "'", "&amp;", "&", ";", ">", "<", "x-y", "\u00a0"];
		for (let n = 0; n < 500; n++) {
			let html = "";
			let length = Math.floor(next() * 40);
			for (let i = 0; i < length; i++) {
				html += next() < 0.15 ? "<x " : parts[Math.floor(next() * parts.length)];
			}
			check(html);
		}
	});
});
