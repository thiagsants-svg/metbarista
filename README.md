# Not Nine Bar

**Espresso is not nine bar.** A station for the [Meticulous](https://meticuloushome.com) espresso machine: recipe, grinder, refractometer and every shot's curve, on a tablet next to the machine.

Live at **[not9bar.com](https://not9bar.com)**. Free, no account, no cloud: the browser talks straight to your machine on the local network.

Not Nine Bar is built on **[MetBarista](https://github.com/nakashon/metbarista)** by **[Asaf Nakash](https://nakashon.com)**, the open control center for Meticulous machines (MIT License). The shot charts, profiles and machine connection come from his work.

---

## What it does

| | |
|---|---|
| **Station** | Full screen on a tablet, either orientation, no scrolling. Pick a profile, set dose, ratio and temperature on wheels, *slide to heat*. Live curve with the stage the shot is in and what it aims for. The piston's retraction is set from the recipe. During the purge, the piston on screen follows the real one, and the pressure gauge stands out until the pressure is back to rest. The idle screen shows the profile's own dial-in tip above the last shots. |
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

Bluetooth (grinder, refractometer) needs Chrome on Android or a computer; iPhone and iPad browsers can't.

**Privacy:** your data stays in your browser. The site counts, anonymously, how many devices open it each day (and how many use the Station with a machine): a +1 on the project's own counter (a Cloudflare Worker, [cloudflare/count-worker.js](cloudflare/count-worker.js)), nothing else. Daily numbers: [not9bar.com/usage](https://not9bar.com/usage).

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

## Credits and license

Ideas from the community, with thanks:

- **Piston health**: the after-shot lift measure and its thresholds come from [ha-meticulous](https://github.com/hessius/ha-meticulous) by hessius (MIT), itself based on Nick Wilson's [meticulous-addon](https://github.com/nickwilsonr/meticulous-addon).
- **Shot facts**: the idea comes from [Metic](https://github.com/hessius/MeticAI) by hessius; the rules and thresholds here are our own.
- **Taste compass**: the idea is Barista Hustle's Espresso Compass, as Metic puts it after the shot; the drawing and rules here are our own.
- **Purge piston**: drawing the piston at its real position comes from the purge screen of the Meticulous dial ([meticulous-dial](https://github.com/MeticulousHome/meticulous-dial)); the drawing here is our own.

MIT License. Original work © Asaf Nakash and contributors ([MetBarista](https://github.com/nakashon/metbarista)); Not Nine Bar changes © its contributors. See [LICENSE](LICENSE).
