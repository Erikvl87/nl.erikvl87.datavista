---
sidebar_position: 2
title: Label
---

import FlowCard from '@site/src/components/FlowCard';

# Label

The **Label** widget shows short text values with optional horizontal scrolling for longer messages. Use it for quick status updates or contextual information driven by device capabilities, Homey variables, or DataVista action cards.

![Label widget animation](/img/docs/label-widget-animation.gif)

## Add the widget to your dashboard

1. Open the Homey app and go to **Dashboards**.
2. Enter **Edit Mode** and select **Add Widget**.
3. Choose **Apps** and select **DataVista**.
4. Pick the **Label** widget.
5. Click the preview to add it to your dashboard.

![Label widget preview](/img/docs/label-widget-preview.png)

## Configure the widget

| Setting | Description |
| --- | --- |
| **Datasource** | Select a DataVista text value*, device capability, or Homey variable to supply the text. |
| **Text fade-in effect** | Enable a fade-in animation when the text updates. Disable it for rapidly changing labels. |
| **Bold text** | Toggle bold styling. |
| **Refresh interval** | Polling frequency when using device capabilities or Homey variables. |
| **Show icon** | Display the capability or device icon (capability takes priority). |
| **Show name** | Display the datasource name. |
| **Color if true** | Background color when the datasource resolves to `true`. |
| **Overwrite name** | Replace the datasource name with custom text. |

:::warning
To use a **DataVista text value**, create a flow that sets the value via a DataVista action card and run it once so the value becomes selectable in the widget settings.

<FlowCard source="actions/set-text.json" />
:::

## FAQ

### Why does the label show "Configure me"?

The datasource is missing or unavailable. Reconfigure the datasource setting and select a valid source.
