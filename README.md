# Movies & Games

A TV-style app for the whole family: watch free classic movies and cartoons, play trivia, and play games with a controller.

- **Movies first.** The home screen opens on a big featured movie with Play already selected, plus rows of movies below.
- **Family profiles.** Add up to 8 profiles with your own names, colors and photos. Each one belongs to an age group (Little Kids 0–6, Kids 7–12, Teens 13–17, Adults 18+) that decides which movie rows show.
- **Parent PIN.** Teens and Adults profiles (and any profile you choose) need a 4-digit parent PIN to open. Managing profiles needs the PIN too. The PIN is saved on the device as a hash, not as the numbers.
- **Movie previews.** On bigger screens the featured movie plays a short silent preview after a moment.
- **Categories.** New Free Movies, Classic Cartoons, Holiday Favorites, Nature & Animals, Comedy, Silent Films, Musicals, Westerns, Documentaries, Adventure, Sci-Fi, Film Noir and Horror (by age group).
- **Games & Trivia column.** Movie Trivia, Animal Quiz, World Quiz and Space Dodge. Pick one to start it.
- **Controller, remote or keyboard.** Arrow keys or D-pad to move, A / Enter to choose, B / Escape to go back. In trivia, A, B, X and Y (or 1–4 on a keyboard) pick the answers.
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
- `js/trivia.js`: the trivia game
- `js/space-dodge.js`: the Space Dodge arcade game
- `js/app.js`: screens and navigation
