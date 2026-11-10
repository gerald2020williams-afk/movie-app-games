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
- **Movie previews.** On bigger screens the featured movie plays a short silent preview after a moment.
- **Categories.** New Free Movies, Classic Cartoons, Holiday Favorites, Nature & Animals, Comedy, Silent Films, Musicals, Westerns, Documentaries, Adventure, Sci-Fi, Film Noir and Horror (by age group).
- **Controller, remote or keyboard.** Arrow keys or D-pad to move, A / Enter to choose, B / Escape to go back. While a movie plays: OK pauses, left/right skip 10 seconds, Y goes full screen.
- **Games & Trivia** (Movie Trivia, Animal Quiz, World Quiz, Space Dodge) are built but switched off for now while the movie side is polished. Their code is in `js/trivia.js` and `js/space-dodge.js`.
- **Black & Gold** look, sized for TVs and still usable on phones and computers.

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
- `js/catalog.js`: Internet Archive search and playback links
- `js/profiles.js`: family profiles and the parent PIN
- `js/history.js`: Continue Watching progress for each profile
- `js/cast.js`: Chromecast and AirPlay
- `js/library.js`: My List, thumbs up/down and watch history
- `js/theme.js`: Black & Gold and the holiday looks
- `js/remote.js`: phone-as-remote connection
- `sw.js`, `manifest.webmanifest`, `icons/`: install as an app
- `js/trivia.js`: the trivia game
- `js/space-dodge.js`: the Space Dodge arcade game
- `js/app.js`: screens and navigation
