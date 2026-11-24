# Not Nine Bar

**Espresso is not nine bar.** A station for the [Meticulous](https://meticuloushome.com) espresso machine: recipe, grinder, refractometer and every shot's curve, on a tablet next to the machine.

Live at **[not9bar.com](https://not9bar.com)**. Free, no account, no cloud: the browser talks straight to your machine on the local network.

Not Nine Bar is built on **[MetBarista](https://github.com/nakashon/metbarista)** by **[Asaf Nakash](https://nakashon.com)**, the open control center for Meticulous machines (MIT License). The shot charts, profiles and machine connection come from his work.

---

## What it does

| | |
|---|---|
| **Station** | Full screen on a tablet, either orientation, no scrolling. Pick a profile, set dose, ratio and temperature on wheels, *slide to heat*. Live curve with the stage the shot is in and what it aims for. The piston's retraction is set from the recipe. |
| **Grinder** | The BOOKOO Motto 80 is read over Bluetooth: the grind at the moment you brew goes with the shot. Other grinders: type the setting. |
| **Refractometer** | The DiFluid R2 Extract fills the TDS by itself; extraction yield and a brew control chart (EY × TDS, ratio lines, target box) follow. |
| **After the shot** | Like / dislike (saved on the machine, the official app shows it), taste, TDS, notes, and the plan for the next shot (temperature and ratio; grind as a reminder). The plan waits for you when you pick that coffee again. |
| **Shots** | Every shot with its coffee, grind, TDS / EY, taste and the plan decided after it. Per coffee: likes, EY range, grind now, the plan waiting and the brew chart of all its readings. Notes editable afterwards. |
| **Coffees** | The shelf: bag photos, in use / frozen / finished. Freezer as single doses (counted down per shot) or a whole bag (off the Station until thawed). |
| **Stats** | Shots, coffee used, likes, EY, taste and each coffee's story, by week or month. No scores, levels or badges. |
| **Profiles** | Browse, load, create and share profiles. |
| **Backup** | Everything lives in the tablet's browser; one file (with the bag photos) saves and restores it. |

Bluetooth (grinder, refractometer) needs Chrome on Android or a computer; iPhone and iPad browsers can't.

## Use it

1. Open [not9bar.com](https://not9bar.com) on a tablet on the same Wi-Fi as the machine and enter the machine's IP address.
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

MIT License. Original work © Asaf Nakash and contributors ([MetBarista](https://github.com/nakashon/metbarista)); Not Nine Bar changes © its contributors. See [LICENSE](LICENSE).
