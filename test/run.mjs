// Runs template.tpl's ___TESTS___ scenarios under Node, with stand-ins for
// the Tag Manager APIs the template uses, and checks the parts of the file
// Tag Manager reads. Tag Manager's own editor (Templates → AnalyticsTrend →
// Tests → Run tests) is the real check; this catches a slip before then.
//
//   node test/run.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@analyticstrend/web@0.9.0/dist/script.js";

export function sections(text) {
  const out = {};
  const parts = text.replace(/\r\n/g, "\n").split(/^___([A-Z_]+)___$/m);
  for (let i = 1; i < parts.length; i += 2) out[parts[i]] = parts[i + 1].trim();
  return out;
}

/** The scenarios of a ___TESTS___ section: `- name:` then `code: |-` and an indented block. */
export function scenarios(yaml) {
  const list = [];
  for (const chunk of yaml.split(/^- name: /m).slice(1)) {
    const [nameLine, ...rest] = chunk.split("\n");
    const start = rest.findIndex((line) => line.trim() === "code: |-");
    const code = [];
    for (const line of rest.slice(start + 1)) {
      if (line.startsWith("    ") || line === "") code.push(line.slice(4));
      else break;
    }
    list.push({ name: nameLine.trim(), code: code.join("\n") });
  }
  return list;
}

function makeTableMap(rows, key, value) {
  if (!rows || rows.length === 0) return null;
  return Object.fromEntries(rows.map((row) => [row[key], row[value]]));
}

/** Runs one scenario: its code may call mock, runCode, assertApi, assertThat and fail. */
function runScenario(templateCode, scenario) {
  const calls = {};
  const mocks = {};
  const record = (name, args) => (calls[name] ??= []).push(args);
  const real = {
    makeString: (v) => (v === undefined || v === null ? "" : String(v)),
    makeTableMap,
    logToConsole: () => {},
    setInWindow: () => true,
    copyFromWindow: () => undefined,
    callInWindow: () => undefined,
    injectScript: () => {},
    createQueue: () => () => {},
  };
  const api = (name) => (...args) => {
    record(name, args);
    return (mocks[name] ?? real[name])(...args);
  };
  const require = (name) => {
    if (!(name in real)) throw new Error(`the template requires ${name}, which this runner doesn't stand in for`);
    return api(name);
  };
  const runCode = (data) => {
    const full = { ...data, gtmOnSuccess: api("gtmOnSuccess"), gtmOnFailure: api("gtmOnFailure") };
    real.gtmOnSuccess = () => {};
    real.gtmOnFailure = () => {};
    new Function("require", "data", templateCode)(require, full);
  };
  const assertApi = (name) => ({
    wasCalled: () => assert.ok(calls[name]?.length, `${name} was not called`),
    wasNotCalled: () => assert.ok(!calls[name]?.length, `${name} was called`),
    wasCalledWith: (...args) =>
      assert.ok(
        (calls[name] ?? []).some((c) => {
          try {
            assert.deepEqual(c.slice(0, args.length), args);
            return true;
          } catch {
            return false;
          }
        }),
        `${name} was not called with ${JSON.stringify(args)}; calls: ${JSON.stringify(calls[name])}`,
      ),
  });
  const assertThat = (actual) => ({
    isEqualTo: (expected) => assert.deepEqual(actual, expected),
    isUndefined: () => assert.equal(actual, undefined),
    isTrue: () => assert.equal(actual, true),
  });
  const mock = (name, impl) => {
    mocks[name] = impl;
  };
  const fail = (message) => assert.fail(message);
  new Function("mock", "runCode", "assertApi", "assertThat", "fail", scenario.code)(mock, runCode, assertApi, assertThat, fail);
}

const text = readFileSync(path.join(ROOT, "template.tpl"), "utf8");
const parts = sections(text);
const failures = [];
const check = (name, fn) => {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`not ok - ${name}\n  ${error.message.split("\n").join("\n  ")}`);
  }
};

check("has every section Tag Manager reads", () => {
  for (const name of ["TERMS_OF_SERVICE", "INFO", "TEMPLATE_PARAMETERS", "SANDBOXED_JS_FOR_WEB_TEMPLATE", "WEB_PERMISSIONS", "TESTS"]) {
    assert.ok(parts[name], `no ___${name}___`);
  }
});

check("the info names AnalyticsTrend as an analytics tag for the web", () => {
  const info = JSON.parse(parts.INFO);
  assert.equal(info.type, "TAG");
  assert.equal(info.displayName, "AnalyticsTrend");
  assert.deepEqual(info.categories, ["ANALYTICS"]);
  assert.deepEqual(info.containerContexts, ["WEB"]);
  assert.match(info.brand.thumbnail, /^data:image\/png;base64,/);
  assert.ok(info.description.includes("https://analyticstrend.com/docs/guide/install-gtm"));
  assert.ok(info.description.length <= 400, `description is ${info.description.length} characters`);
});

check("the fields are the plan's, and the key field checks the key", () => {
  const fields = JSON.parse(parts.TEMPLATE_PARAMETERS);
  const names = fields.flatMap((f) => [f.name, ...(f.subParams ?? []).map((s) => s.name)]);
  for (const name of ["action", "writeKey", "outboundLinks", "fileDownloads", "eventName", "eventProperties"]) {
    assert.ok(names.includes(name), `no ${name} field`);
  }
  const key = fields.find((f) => f.name === "writeKey");
  const regex = key.valueValidators.find((v) => v.type === "REGEX").args[0];
  assert.ok(new RegExp(regex).test("  wk_0123456789abcdef0123456789abcdef "));
  assert.ok(!new RegExp(regex).test("wk_0123456789ABCDEF0123456789abcdef"));
});

check("may inject exactly the pinned script, and touch only its own globals", () => {
  const permissions = JSON.parse(parts.WEB_PERMISSIONS);
  const inject = permissions.find((p) => p.instance.key.publicId === "inject_script");
  const urls = inject.instance.param.find((p) => p.key === "urls").value.listItem.map((i) => i.string);
  assert.deepEqual(urls, [SCRIPT_URL]);
  const globals = permissions.find((p) => p.instance.key.publicId === "access_globals");
  const keys = globals.instance.param.find((p) => p.key === "keys").value.listItem.map((i) => i.mapValue[0].string);
  assert.deepEqual(keys.sort(), ["analyticsTrend.track", "analyticsTrendConfig", "analyticsTrendQueue", "analyticsTrendStartedKey"]);
  const logging = permissions.find((p) => p.instance.key.publicId === "logging");
  assert.equal(logging.instance.param[0].value.string, "debug");
});

check("the code uses only what the sandbox runs", () => {
  const code = parts.SANDBOXED_JS_FOR_WEB_TEMPLATE;
  assert.doesNotMatch(code, /\bvar\b/, "var is not supported");
  assert.doesNotMatch(code, /=>/, "arrow functions are avoided");
  assert.doesNotMatch(code, /[=(,]\s*\/[^/*]/, "no regular expression literals");
  assert.doesNotMatch(code, /\bnew\b|\bclass\b|\btypeof\b/);
  assert.ok(code.includes(`'${SCRIPT_URL}'`));
});

const list = scenarios(parts.TESTS ?? "");
check("has the plan's scenarios", () => {
  for (const name of [
    "page views set the config and inject the pinned script",
    "link options reach the config as strings",
    "an event is queued with its properties",
    "a malformed key fails the tag without injecting",
  ]) {
    assert.ok(list.some((s) => s.name === name), `no scenario "${name}"`);
  }
});
for (const scenario of list) check(`scenario: ${scenario.name}`, () => runScenario(parts.SANDBOXED_JS_FOR_WEB_TEMPLATE, scenario));

check("metadata names the homepage, the guide and a version per release", () => {
  const meta = readFileSync(path.join(ROOT, "metadata.yaml"), "utf8");
  assert.match(meta, /^homepage: "?https:\/\/analyticstrend\.com"?$/m);
  assert.match(meta, /^documentation: "?https:\/\/analyticstrend\.com\/docs\/guide\/install-gtm"?$/m);
  assert.match(meta, /^versions:/m);
});

check("is Apache 2.0, held by Deasil", () => {
  const license = readFileSync(path.join(ROOT, "LICENSE"), "utf8");
  assert.match(license, /^Copyright 2026 Deasil$/m);
  assert.match(license, /Apache License\s+Version 2\.0, January 2004/);
  assert.doesNotMatch(license, /Deasil Inc/);
});

if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
