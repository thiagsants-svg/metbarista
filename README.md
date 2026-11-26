# Not Nine Bar

**Espresso is not nine bar.** A station for the [Meticulous](https://meticuloushome.com) espresso machine: recipe, grinder, refractometer and every shot's curve, on a tablet next to the machine.

Live at **[not9bar.com](https://not9bar.com)**. Free, no account, no cloud: the browser talks straight to your machine on the local network.

Not Nine Bar is built on **[MetBarista](https://github.com/nakashon/metbarista)** by **[Asaf Nakash](https://nakashon.com)**, the open control center for Meticulous machines (MIT License). The shot charts, profiles and machine connection come from his work.

---

## What it does

| | |
|---|---|
| **Station** | Full screen on a tablet, either orientation, no scrolling. Pick a profile, set dose, ratio and temperature on wheels, *slide to heat*. Live curve with the stage the shot is in and what it aims for. The piston's retraction is set from the recipe. During the purge, the piston on screen follows the real one, and a bar follows the pressure down to rest (0.4 bar). The idle screen shows the profile's own dial-in tip above the last shots. |
| **Grinder** | The BOOKOO Motto 80 is read over Bluetooth: the grind at the moment you brew goes with the shot. Other grinders: type the setting. |
| **Refractometer** | The DiFluid R2 Extract fills the TDS by itself; extraction yield and a brew control chart (EY × TDS, ratio lines, target box) follow. |
| **After the shot** | Like / dislike (saved on the machine, the official app shows it), taste on the espresso compass (sour ↔ bitter, weak ↔ strong), TDS, notes, and the plan for the next shot (temperature and ratio; grind as a reminder). The plan waits for you when you pick that coffee again. If the curves show something, it's there too. |
| **Shot facts** | What the curves say, worked out from the shot's own samples (no AI): channeling, a choked puck, a weak puck that never reached the pressure asked for, a stage's limit taking over. Each one with the stage, the second and the numbers, marked on the chart. Tuned on 645 real shots. |
| **Shots** | Every shot with its coffee, grind, TDS / EY, taste and the plan decided after it, its curve with the target the machine was following (dotted) and its shot facts. Per coffee: likes, EY range, grind now, the plan waiting and the brew chart of all its readings. Notes editable afterwards. |
| **Coffees** | The shelf: bag photos, in use / frozen / finished. Freezer as single doses (counted down per shot) or a whole bag (off the Station until thawed). |
| **Stats** | Shots, coffee used, likes, EY, taste and each coffee's story, by week or month. No scores, levels or badges. |
| **Piston health** | How hard the motor works to lift the piston after every shot, by week since the machine's first shot: it rises as the seal dries or scale builds up and drops after greasing or descaling. Log your maintenance and see before and after. Read from the shots the machine already keeps. |
| **Profiles** | Browse, load, create and share profiles. |
| **Backup** | Everything lives in the tablet's browser; one file (with the bag photos) saves and restores it. |

### Which devices

| Device | Works? |
|---|---|
| Android tablet or phone, **Chrome** | Yes, everything: machine, grinder and refractometer |
| Windows, Mac, Linux or Chromebook, **Chrome** or **Edge** | Yes, everything |
| **iPhone or iPad**, any browser | **No** |
| Mac, **Safari** | No |

**Why not iPhone or iPad.** The site is served over https (not9bar.com) and the machine answers over plain http on your Wi-Fi (`http://192.168.x.x`). Chrome lets a site reach devices on the local network once you allow it (it asks the first time: allow it). Safari doesn't: it blocks an https page from talking to an http device on the local network, and it has no way to ask for permission. On iPhone and iPad every browser (Chrome, Edge, Firefox too) is Safari underneath, because Apple requires its engine, so none of them can reach the machine. Safari also has no Web Bluetooth, so the Motto 80 grinder and the DiFluid refractometer can't connect either.

The only way around it on iOS would be an app of its own, outside the browser.

**Privacy:** your data stays in your browser. The site counts, anonymously, how many devices open it each day (and how many use the Station with a machine): a +1 on the project's own counter (a Cloudflare Worker, [cloudflare/count-worker.js](cloudflare/count-worker.js)). The site also loads Cloudflare Web Analytics, which tells Cloudflare the page visited, the referrer and the browser, without cookies. The Community page reads Meticulous's news through MetBarista's feed proxy (a Cloudflare Worker run by MetBarista's author), which sees the visitor's IP address. Daily numbers: [not9bar.com/usage](https://not9bar.com/usage).

## Use it

1. Open [not9bar.com](https://not9bar.com) on a tablet on the same Wi-Fi as the machine and enter the machine's IP address. The Station is at [not9bar.com/station](https://not9bar.com/station).
2. In Chrome, *Add to home screen* for a full-screen app.
3. Save a backup now and then (the button at the top of the Station).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # type check, lint and tests (the deploy runs the same)
```

Next.js (static export) on GitHub Pages; pushing to `main` deploys.

## Adapting Not Nine Bar to another machine

Everything machine-facing is written for the Meticulous: its local API, its live socket and its state names. To use your own machine in a fork, keep the Station's screens and replace what feeds them. The quickest way in is to follow one reading.

### One pressure reading, end to end

1. **Socket.** [`lib/machine-socket.ts`](lib/machine-socket.ts): `connectSocket()` opens a socket.io (EIO4) HTTP-polling session at `<machineBase()>/socket.io/`. `doPoll()` fetches, `parsePackets()` splits out the `42[event, data]` packets, and each `status` event goes to every listener through `emit.status`.
2. **Type.** [`lib/types.ts`](lib/types.ts): `LiveStatus.sensors.p` is the pressure in bar.
3. **Readings.** [`lib/station/readings.ts`](lib/station/readings.ts): `readingsOf(status)` turns `sensors.p` into `pressure` (and `f`, `w`, `g`, `t` into `flow`, `weight`, `grav`, `temp`). A missing or non-numeric value becomes `undefined`. This is the only place the live status's sensor fields are read (saved shots in the history have their own frame format).
4. **Live hook.** [`lib/station/use-machine-live.ts`](lib/station/use-machine-live.ts): the `status` handler in `useMachineLive()` keeps the whole status (`setStatus`). While `isExtracting(s)` is true ([`lib/brew-state.ts`](lib/brew-state.ts)), it also appends a `ShotPoint` with `pressure: r.pressure ?? null`, where `r = readingsOf(s)`. The collected points reach the chart every 250 ms.
5. **Screen.** [`app/station/page.tsx`](app/station/page.tsx): `StationPage` sets `sensors = readingsOf(status)`. The pressure then shows in three places:
    - `<PressureGauge value={sensors.pressure}>`, from [`components/pressure-gauge.tsx`](components/pressure-gauge.tsx);
    - the chart's live legend, `live={{ pressure: sensors.pressure, … }}`;
    - the curve, drawn from `data` by `ShotCharts` and `ShotPlot` in [`components/shot-charts.tsx`](components/shot-charts.tsx).

The smallest port therefore produces a `LiveStatus` for your machine: a `status` event with `name` (in the Meticulous's state names, see [Where the Meticulous-only parts live](#where-the-meticulous-only-parts-live)), `extracting` and `sensors`. If your machine names its sensors differently, change only `readingsOf()`. Everything from step 4 on stays as it is.

### Readings the Station uses

| Field (`LiveStatus`) | Meaning | Unit | When it's missing today |
|---|---|---|---|
| `sensors.p` | Pressure at the group | bar | The number reads "—" and the gauge shows no needle. The curve skips the sample (`connectNulls` draws straight across gaps). During a purge, `(pressureNow ?? 0)` counts it as 0 bar, so the "Depressurizing" bar never shows and the piston panel closes when the purge ends. |
| `sensors.f` | Flow the machine pushes into the puck | ml/s | The readout and legend show "—", and the curve skips the sample. |
| `sensors.w` | Scale weight | g | The readout shows "—". Below −1 g while not brewing, it shows "—" with the label "Weight · tap Tare". Chart points use `null` unless the weight is above 0, and the cup drawing shows empty (`weight ?? 0`). |
| `sensors.g` | Flow into the cup, from the scale | g/s | Estimated by `gravFlow()` in [`lib/station/format.ts`](lib/station/format.ts) from the last ~1.2 s of `w`, clamped at 0. It is `null` with fewer than 2 samples, or under 0.3 s of them, and it is only computed while extracting. |
| `sensors.t` | Water temperature (the Meticulous reports its tube) | °C | The heating chart gets no samples, so its plot area stays empty. The number reads "—" and the temperature gauge shows no needle. |
| `setpoints.temperature` | Target temperature | °C | The gauge's mark and the heating chart's target line fall back to the last target seen, then to none. |
| `time` | Shot clock | ms | It is used only if it restarts with the shot. Otherwise the Station times the shot itself. |
| `name`, `extracting` | Machine state | text, bool | Without `extracting: true`, `isExtracting()` in [`lib/brew-state.ts`](lib/brew-state.ts) is false, so no shot is charted. With it, any `name` outside the Meticulous's non-brewing names counts as brewing: a heating or waiting state with another name would be charted as the shot. |

The group thermometers (`t_bar_up` … `t_external_2`) and the piston position (`m_pos`) come in a separate `sensors` event, typed as `LiveTemperatures`. Missing ones are just left out of the heating chart's legend and lines (`groupTempsFor()`, `HEAT_SENSORS`).

**Machine flow vs. scale flow.** `f` is the water the machine pushes into the puck, in ml/s, as the machine measures it. `g` (shown as "In cup") is how fast the cup gains weight, in g/s, read from the scale. They differ on purpose. Early in a shot the puck soaks up water, so `f` is high while `g` is still 0. Later, `g` shows what actually reaches the cup. The Station uses the machine's own `g` when it sends one (`r.grav ?? gravFlow(...)` in `useMachineLive()`). A machine without a scale needs neither `w` nor `g`: those readouts then show "—".

### Example: show a boiler's temperature

The Meticulous has no boiler: `sensors.t` is the temperature of its tube. `readingsOf()` reads it as `temp`, and from there:

- `useMachineLive()` turns `temp` into the heating curve and into the shot points.
- `StationPage` passes `sensors.temp` to `TemperatureGauge` (labelled "Temperature"), to `HeatingProgress` and to `RecentShots`.
- Its name on screen is `TEMP_LABEL` ("Water temp") in [`lib/station/readings.ts`](lib/station/readings.ts), used by `HEAT_SENSORS` in [`components/shot-charts.tsx`](components/shot-charts.tsx) and by the idle screen in [`components/recent-shots.tsx`](components/recent-shots.tsx).

For a boiler machine:

1. **Fill the value.** In `readingsOf()`, set `temp` from your boiler reading, in °C.
2. **Rename the label.** Set `TEMP_LABEL` to "Boiler".
3. **Show it on the shot chart, if you want.** `StationPage` passes `showTemps={false}` to `ShotCharts`, because on the Meticulous the sensors read the emptying chamber. A steady boiler may be worth showing.

### Where the Meticulous-only parts live

- **Connection:** [`lib/machine-socket.ts`](lib/machine-socket.ts) handles the socket events `status`, `sensors`, `temperatures`, `heater_status` and `notification`. [`lib/machine-api.ts`](lib/machine-api.ts) wraps the REST API under `/api/v1`. Both start from `machineBase()` in [`lib/machine-ip.ts`](lib/machine-ip.ts), which builds `http://<ip>` from the IP saved in this browser: change it there for another port, https or a hostname.
- **Commands:** `ActionType` in [`lib/types.ts`](lib/types.ts) lists the commands (`start`, `continue`, `stop`, `preheat`, `tare`, `purge`, `home`, …), sent by `executeAction()`. Your fork can map these to your machine or hide the buttons. The Tare, Purge, Raise and Preheat buttons sit at the end of `StationPage`.
- **Heating and preheat:** the Station starts a shot through `startShot()` in `StationPage`. It loads an unsaved profile (`loadProfileInline()`, `buildShotProfile()` in [`lib/recipe.ts`](lib/recipe.ts)), and the machine heats and waits. The preheat countdown comes from `heater_status`.
- **States:** the Meticulous's state names, such as `"click to start"` and `"pour water and click to continue"`, live in [`lib/brew-state.ts`](lib/brew-state.ts) and in `STATUS_LABELS` in [`lib/station/format.ts`](lib/station/format.ts).
- **Piston and purge:** these are all Meticulous-only:
    - the drawing in [`components/station/purge-piston.tsx`](components/station/purge-piston.tsx), fed by `m_pos`;
    - `RESTING_BAR` and the after-purge `settling` logic in `StationPage`;
    - the retraction set before each shot, with `retractionFor()` and `updateSettings({ partial_retraction })`.
- **Piston health:** [`lib/piston.ts`](lib/piston.ts) and [`lib/piston-store.ts`](lib/piston-store.ts) read the motor current from the machine's shot history.
- **History, profiles, like/dislike and machine messages:** `getHistory()`, `listProfiles()` and `rateShot()` in [`lib/machine-api.ts`](lib/machine-api.ts), and [`lib/station/use-machine-notices.ts`](lib/station/use-machine-notices.ts). The Shots, Stats and Profiles pages read the Meticulous's shot and profile formats (`ShotEntry`, `Profile` in [`lib/types.ts`](lib/types.ts)).

## Credits and license

Ideas from the community, with thanks:

- **Piston health**: the after-shot lift measure and its thresholds come from [ha-meticulous](https://github.com/hessius/ha-meticulous) by hessius (MIT), itself based on Nick Wilson's [meticulous-addon](https://github.com/nickwilsonr/meticulous-addon).
- **Shot facts**: the idea comes from [Metic](https://github.com/hessius/MeticAI) by hessius; the rules and thresholds here are our own.
- **Taste compass**: the idea is Barista Hustle's Espresso Compass, as Metic puts it after the shot; the drawing and rules here are our own.
- **Estimated TDS**: the idea of estimating a shot's TDS from earlier refractometer readings comes from [portal-met-bridge](https://github.com/privaterra/portal-met-bridge) by privaterra (MIT), which calibrates a Belka Portal's conductivity that way; here, without a sensor, it uses the typical extraction yield of the coffee's measured shots made alike.
- **AI review**: a stage-by-stage review of a shot by the AI you choose (Claude, ChatGPT, Gemini or Grok), with your own key kept on the tablet, follows the idea of [portal-met-bridge](https://github.com/privaterra/portal-met-bridge) by privaterra (MIT); the code and prompt here are our own.
- **Purge piston**: drawing the piston at its real position comes from the purge screen of the Meticulous dial ([meticulous-dial](https://github.com/MeticulousHome/meticulous-dial)); the drawing here is our own.

MIT License. Original work © Asaf Nakash and contributors ([MetBarista](https://github.com/nakashon/metbarista)); Not Nine Bar changes © its contributors. See [LICENSE](LICENSE).
