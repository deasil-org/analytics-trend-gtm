# AnalyticsTrend for Google Tag Manager

A Google Tag Manager tag template for [AnalyticsTrend](https://analyticstrend.com): product analytics with no cookies and no personal data.

Full guide: <https://analyticstrend.com/docs/guide/install-gtm>

## What it does

The tag has two actions:

- **Count page views** loads the AnalyticsTrend script with your project's write key. It counts the page and every page the visitor moves to, including in-app navigation on a single-page site. It can also count clicks on links to other sites and file downloads. Fire it once per page, on **Initialization - All Pages**.
- **Send an event** sends one event of your own, such as a sign-up, with optional properties. The container also needs a **Count page views** tag. If the event fires before the script has loaded, it waits and is sent once the script starts.

The script is `@analyticstrend/web`, loaded from jsDelivr at an exact version. The tag sets no cookies. Browsers that send Global Privacy Control are not counted.

## Install

**From the Community Template Gallery:** in your container, go to **Templates** → **Tag Templates** → **Search Gallery**, search for **AnalyticsTrend** and add it to your workspace.

**By hand:** download [`template.tpl`](template.tpl). In your container, go to **Templates** → **Tag Templates** → **New**, open the ⋮ menu, choose **Import** and pick the file. Then **Save**.

Then:

1. Go to **Tags** → **New**, and choose **AnalyticsTrend** as the tag type.
2. Leave **Count page views** selected and paste your write key. It's on your project's setup page in AnalyticsTrend and starts with `wk_`.
3. Set the trigger to **Initialization - All Pages**, save, and publish the container.

## Consent

AnalyticsTrend sets no cookies and keeps no personal data. Whether your site needs consent before it runs depends on your site and the law where you and your visitors are. If you use Tag Manager's consent settings, add a check under the tag's **Advanced Settings** → **Consent Settings**.

## Tests

The template's tests run in Tag Manager's template editor, under **Tests** → **Run tests**. The same scenarios also run under Node 22 or later, with stand-ins for Tag Manager's APIs:

```bash
node test/run.mjs
```

## Licence

Apache License 2.0. Copyright 2026 Deasil. See [LICENSE](LICENSE).
