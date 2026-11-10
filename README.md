# Movies & Games

A TV-style app for the whole family: watch free classic movies and cartoons, play trivia, and play games with a controller.

- **Movies first.** The home screen opens on a big featured movie with Play already selected, plus rows of movies below.
- **Family profiles.** Add up to 8 profiles with your own names, colors and photos. Each one belongs to an age group (Little Kids 0–6, Kids 7–12, Teens 13–17, Adults 18+) that decides which movie rows show.
- **Parent PIN.** Teens and Adults profiles (and any profile you choose) need a 4-digit parent PIN to open. Managing profiles needs the PIN too. The PIN is saved on the device as a hash, not as the numbers.
- **Continue Watching.** Each profile picks up where it left off, with a progress bar on the movie.
- **Up next.** When a movie ends, the next one in that row starts after a 10-second countdown (Play now or Cancel).
- **Polished rows.** Only movies with a playable video are shown, sharper pictures load in as you scroll, and movie lists are saved on the device for 12 hours so the app opens fast.
- **Cast to TV.** A Cast to TV button appears in the player when a Chromecast (Chrome on Android, Windows, Mac or ChromeOS) or AirPlay TV (iPhone, iPad, Mac Safari) is on the same Wi-Fi. The phone then becomes the remote: pause, skip 10 seconds, stop casting. Continue Watching and Up next keep working while casting.
- **My List, Top 10 This Week, thumbs up/down.** Save movies for later, see the most-watched free movies this week, and rate movies: liked rows move up, thumbs-down movies are hidden for that profile.
- **Movie page.** Big picture, description, Play/Resume, a silent preview clip, My List, thumbs, and More Like This.
- **Browse (Movies tab).** Filter by category, decade, color or black & white, and sort by popular, newest, oldest or A to Z.
- **Voice search** on phones, tablets and computers whose browser supports it.
- **Watch history for parents** (behind the parent PIN): what each profile watched and for how long.
- **Holiday looks** that switch on around Christmas, New Year, Valentine's Day, the Fourth of July, Halloween and Thanksgiving, or can be picked by a parent.
- **Phone remote.** The TV shows a code and QR code; a phone scans it and becomes a remote with arrows, OK, Back, Home and search. Devices connect directly using the free PeerJS service.
- **Install as an app** on phones, tablets and computers (Install app button, or Share → Add to Home Screen on iPhone/iPad). The app's own files are saved for offline opening.
- **Kid safety filter.** Very old cartoons and films with racist stereotypes or wartime propaganda are left out of kids' rows and hidden for every profile with the safety filter on (all but Adults by default; changeable per profile). Parents can also hide any movie with **Hide this movie**, and undo it under Hidden movies.
- **Credits.** Each movie page credits its maker and license, and About & credits lists the Creative Commons films, fonts and libraries, plus a short privacy note.
- **Sync devices.** Link the family's devices with a 6-digit code. Profiles, the parent PIN, My List, Continue Watching, likes, hidden movies, watch history and the app look stay matched whenever two linked devices are open at the same time. They connect directly; nothing is stored on a server.
- **Speed mode** for smart TVs and slower devices (automatic on TVs): no blur, previews or animations.
- **Cell data.** On Android phones the app notices cell data and asks before playing: data saver (smaller file) or full quality. Data saver can also be always on.
- **Screen stays awake** while a movie plays (TVs, tablets, phones), and can sleep again when it ends.
- **Lock-screen controls.** Play, pause, skip and next movie from the lock screen, headphones, car or keyboard media keys.
- **Live Channels.** Cartoon Classics, Family Movie Night, Comedy, Westerns, Sci-Fi, Noir Night and more play free movies back to back on a clock-based schedule, like TV. Up and down on the remote change channels.
- **Collections.** Hand-picked rows such as Family Movie Night, Charlie Chaplin, Buster Keaton, Popeye, Golden Age Comedy, Classic Sci-Fi and Film Noir Essentials.
- **Subtitles and accessibility.** A CC button when a movie has subtitles, text size (Normal, Large, Extra large), high contrast, and screen-reader labels.
- **Posters.** The daily job saves a sharp 480x360 copy of each movie's picture in `posters/`; movies with no picture get a gold-and-black title card.
- **Series and episodes.** Popeye, Superman, Betty Boop, Casper, Felix, Caminandes, Chaplin and Keaton shorts and the Three Stooges each get a show page with numbered episodes, Continue episode, watched marks and Next episode autoplay.
- **Phones and tablets.** Bottom tab bar on phones, swipeable rows, a Mini player (picture-in-picture), and turning the phone sideways goes full screen.
- **Movie previews.** On bigger screens the featured movie plays a short silent preview after a moment.
- **Categories.** New Free Movies, Classic Cartoons, Holiday Favorites, Nature & Animals, Comedy, Silent Films, Musicals, Westerns, Documentaries, Adventure, Sci-Fi, Film Noir and Horror (by age group).
- **Controller, remote or keyboard.** Arrow keys or D-pad to move, A / Enter to choose, B / Escape to go back. While a movie plays: OK pauses, left/right skip 10 seconds, Y goes full screen.
- **Games & Trivia** (Movie Trivia, Animal Quiz, World Quiz, Space Dodge) are built but switched off for now while the movie side is polished. Their code is in `js/trivia.js` and `js/space-dodge.js`.
- **Black & Gold** look, sized for TVs and still usable on phones and computers.

## How it stays fast, safe and reliable

- **Shared catalog.** A GitHub job (`.github/workflows/catalog.yml`) runs `scripts/build-catalog.js` once a day. It collects every movie row, the Top 10 and each movie's video, picture and subtitle links into `catalog.json` on the site. Viewers load that one file instead of each asking the Internet Archive, so rows appear faster and the Archive gets a handful of requests a day instead of thousands. If the file is missing or more than 4 days old, the app asks the Archive directly.
- **Copyright safety.** Only curated Internet Archive collections are used. Films made after 1977 are only shown with an open license (like Creative Commons). To take a movie down for everyone, add its Internet Archive ID or part of its title to `blocklist.json`. **Report a problem** on any movie page opens a prefilled issue on this repository.
- **Quality filter.** Trailers, clips, test uploads and very short files are skipped, feature rows skip anything under 40 minutes, and duplicate copies are removed.
- **Bundled and shrunk.** `npm run build` combines the scripts in `js/` into `dist/app.min.js` and the styles into `dist/styles.min.css`. It also converts newer code so older smart-TV browsers can run it. **Run it after changing anything in `js/` or `styles.css`.**
- **Automatic tests.** `.github/workflows/test.yml` runs every test and a stress test on each update.

## Where the movies come from

Movies are free, legal, public domain films and cartoons streamed from the [Internet Archive](https://archive.org). The app searches it live, so the rows change as the library changes. The Internet Archive has no official age ratings. The age groups are based on which collection and genre a film is in, so parents should still check what younger kids watch.

## Running it

It's a static site with no build step. Open `index.html` through any web server, for example:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`. To use it on a TV, host the folder (for example with GitHub Pages) and open the link in the TV's browser, or on a computer plugged into the TV.

## Files

- `index.html`: page shell and top bar
- `styles.css`: Black & Gold theme and layout
- `js/data.js`: age profiles, movie rows, games list and trivia questions
- `js/input.js`: keyboard, TV remote and game controller input, plus moving between items with the arrows
- `js/catalog.js`: shared catalog, Internet Archive search, copyright and quality rules, playback links
- `js/profiles.js`: family profiles and the parent PIN
- `js/history.js`: Continue Watching progress for each profile
- `js/cast.js`: Chromecast and AirPlay
- `js/library.js`: My List, thumbs up/down and watch history
- `js/theme.js`: Black & Gold and the holiday looks
- `js/remote.js`: phone-as-remote connection
- `js/sync.js`: syncing between linked devices
- `js/settings.js`: settings for this device (speed mode, data saver)
- `sw.js`, `manifest.webmanifest`, `icons/`: install as an app
- `js/trivia.js`: the trivia game
- `js/space-dodge.js`: the Space Dodge arcade game
- `js/app/core.js`: shared state, navigation and movie rows
- `js/app/family.js`: profiles, parent PIN, parent tools, sync, settings, about
- `js/app/remote-screens.js`: phone-remote screens
- `js/app/browse.js`: Home, Movies, Search, the movie page and Report a problem
- `js/app/player.js`: the movie player
- `js/app/live.js`: Live Channels
- `js/app/series.js`: series and episodes
- `posters/`: posters saved by the daily job
- `js/app/start.js`: start-up and remote/controller routing
- `dist/`: the bundled, shrunk files the app actually loads (made by `npm run build`)
- `scripts/build.js`, `scripts/build-catalog.js`: bundling and the daily shared catalog
- `blocklist.json`: movies taken down for everyone

## Testing

The tests open the app in a headless browser with stand-in movies, so they work offline:

```
npm install
npm install --no-save playwright
npx playwright install chromium
npm test
```

Stress test (many viewers at once, a slow or broken movie library, a big family, long sessions, a huge catalog):

```
VIEWERS=40 node tests/stress.js
```

The regular tests cover profiles and the parent PIN, Continue Watching and Up next, casting, My List, Top 10, Browse, the phone remote, sync between two devices, the safety filter, data saver and lock-screen controls.
