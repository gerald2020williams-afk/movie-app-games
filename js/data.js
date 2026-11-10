// Static data: age groups, profiles, movie rows, games, and trivia questions.

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Age groups. Each family profile belongs to one; it decides which movie rows show.
const AGE_GROUPS = [
  { level: 0, name: "Little Kids", ages: "Ages 0–6" },
  { level: 1, name: "Kids", ages: "Ages 7–12" },
  { level: 2, name: "Teens", ages: "Ages 13–17" },
  { level: 3, name: "Adults", ages: "18 and up" },
];

// Colors a profile picture can use when there's no photo.
const PROFILE_COLORS = ["#f0cf7a", "#d4a64a", "#e2574c", "#4cc27a", "#4f8fe8", "#a77bf3", "#f28ab2", "#3cc8c0"];

// Starting profiles on a new device. Families rename, add and remove them.
const DEFAULT_PROFILES = [
  { id: "little", name: "Little Kids", level: 0, color: "#f0cf7a", locked: false },
  { id: "kids", name: "Kids", level: 1, color: "#d4a64a", locked: false },
  { id: "teens", name: "Teens", level: 2, color: "#4f8fe8", locked: true },
  { id: "adults", name: "Adults", level: 3, color: "#e2574c", locked: true },
];
const MAX_PROFILES = 8;

// Rows for younger profiles leave out movies the Internet Archive tags as propaganda or racist.
const KID_SAFE = ' AND NOT subject:(propaganda OR racist OR racism OR "racial stereotypes" OR stereotypes OR blackface OR minstrel OR "censored eleven" OR "world war ii")';

// A shelf is visible to a profile when shelf.level <= profile.level.
// Search for an exact list of titles within trusted collections.
function titles(list, collections) {
  return `mediatype:(movies) AND collection:(${collections}) AND title:(${list.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ")})`;
}

// ----- Copyright safety -----
// Only these Internet Archive collections are used: they're curated libraries of public-domain
// films, classic cartoons and films their owners shared. Open user uploads are never searched.
const TRUSTED_COLLECTIONS = ["feature_films", "classic_cartoons", "animationandcartoons", "silent_films", "film_noir", "prelinger", "ephemera", "documentaryandshortfilms", "scifi_horror"];
// Films made after this year are only shown if they carry an open license (like Creative Commons).
// Older films in the collections above are public domain or were never renewed.
const COPYRIGHT_CUTOFF_YEAR = 1977;

// ----- Quality rules -----
// Titles with these words are usually clips, trailers or test uploads, not full movies.
const JUNK_TITLE = /\b(trailer|teaser|promo|preview|clip|clips|excerpt|sample|test upload|commercial|tv spot|blooper|reel|outtakes?)\b/i;
const MIN_MINUTES = 2; // nothing shorter than this, for any row

// Movie shelves pulled live from the Internet Archive (free, legal, public domain films).
// `q` is an Internet Archive search query.
const SHELVES = [
  // Newer, modern-looking movies: free "open movies" made by the Blender Studio and others,
  // shared under Creative Commons so anyone can watch them for free.
  { id: "new-family", title: "New Free Movies", level: 0, featured: true, licensed: true,
    q: "mediatype:(movies) AND title:(\"Big Buck Bunny\" OR \"Caminandes\" OR \"Wing It\" OR \"Coffee Run\" OR \"Agent 327\") AND (subject:(blender OR \"open movie\" OR animation) OR creator:(blender))" + KID_SAFE },
  { id: "new-teens", title: "New Free Movies for Teens", level: 2, featured: true, licensed: true,
    q: "mediatype:(movies) AND title:(\"Sintel\" OR \"Tears of Steel\" OR \"Cosmos Laundromat\" OR \"Sprite Fright\" OR \"Elephants Dream\") AND (subject:(blender OR \"open movie\" OR animation OR \"science fiction\") OR creator:(blender))" },
  // ----- Hand-picked collections (well-known public-domain films) -----
  { id: "family-night", title: "Family Movie Night", level: 0, collection: true,
    q: titles(["Gulliver's Travels", "Jack and the Beanstalk", "The Little Princess", "Rudolph the Red-Nosed Reindeer", "Mr. Bug Goes to Town", "Hoppity Goes to Town", "The Adventures of Tom Sawyer", "Sherlock Jr.", "Santa Claus Conquers the Martians", "Little Lord Fauntleroy"], "feature_films OR classic_cartoons OR animationandcartoons OR silent_films") + KID_SAFE },
  { id: "chaplin", title: "Charlie Chaplin", level: 0, collection: true,
    q: "mediatype:(movies) AND collection:(feature_films OR silent_films) AND (title:(chaplin) OR subject:(\"charlie chaplin\") OR creator:(chaplin))" + KID_SAFE },
  { id: "keaton", title: "Buster Keaton", level: 0, collection: true,
    q: "mediatype:(movies) AND collection:(feature_films OR silent_films) AND (title:(keaton) OR subject:(\"buster keaton\") OR creator:(keaton))" + KID_SAFE },
  { id: "popeye", title: "Popeye & Friends", level: 0, collection: true,
    q: "mediatype:(movies) AND collection:(classic_cartoons OR animationandcartoons) AND title:(popeye)" + KID_SAFE },
  { id: "superman", title: "Superman Cartoons (1940s)", level: 0, collection: true,
    q: "mediatype:(movies) AND collection:(classic_cartoons OR animationandcartoons) AND title:(superman)" + KID_SAFE },
  { id: "golden-comedy", title: "Golden Age Comedy", level: 1, collection: true, minMinutes: 40,
    q: titles(["His Girl Friday", "My Man Godfrey", "Meet John Doe", "Nothing Sacred", "The Inspector General", "Road to Bali", "Royal Wedding", "Charade"], "feature_films") },
  { id: "classic-scifi", title: "Classic Sci-Fi", level: 2, collection: true, minMinutes: 40,
    q: titles(["Plan 9 from Outer Space", "Teenagers from Outer Space", "Robot Monster", "Killers from Space", "The Phantom Planet", "Lost Continent", "Rocketship X-M", "The Day the Earth Stood Still"], "feature_films OR scifi_horror") },
  { id: "noir-essentials", title: "Film Noir Essentials", level: 3, collection: true, minMinutes: 40,
    q: titles(["D.O.A.", "Detour", "The Stranger", "Scarlet Street", "Kansas City Confidential", "The Hitch-Hiker", "Quicksand", "Too Late for Tears"], "film_noir OR feature_films") },

  { id: "cartoons", title: "Classic Cartoons", level: 0,
    q: "collection:(classic_cartoons) AND mediatype:(movies)" + KID_SAFE },
  { id: "animation", title: "More Animation", level: 0,
    q: "collection:(animationandcartoons) AND mediatype:(movies) AND NOT subject:(horror OR war OR propaganda)" + KID_SAFE },
  { id: "comedy", minMinutes: 40, title: "Comedy Classics", level: 1,
    q: "collection:(feature_films) AND mediatype:(movies) AND subject:(comedy) AND NOT subject:(horror OR crime)" + KID_SAFE },
  { id: "silent", title: "Silent Film Fun", level: 1,
    q: "collection:(silent_films) AND mediatype:(movies) AND subject:(comedy)" + KID_SAFE },
  { id: "holiday", title: "Holiday Favorites", level: 0,
    q: "collection:(classic_cartoons OR animationandcartoons OR feature_films) AND mediatype:(movies) AND subject:(christmas OR holiday OR thanksgiving OR easter OR halloween) AND NOT subject:(horror OR crime OR noir)" + KID_SAFE },
  { id: "nature", title: "Nature & Animals", level: 0,
    q: "collection:(prelinger OR feature_films OR ephemera) AND mediatype:(movies) AND subject:(animals OR wildlife OR nature OR zoo OR birds OR ocean) AND NOT subject:(hunting OR war OR horror)" + KID_SAFE },
  { id: "musicals", minMinutes: 40, title: "Musicals", level: 1,
    q: "collection:(feature_films) AND mediatype:(movies) AND subject:(musical OR musicals) AND NOT subject:(horror OR crime)" + KID_SAFE },
  { id: "westerns", minMinutes: 40, title: "Westerns", level: 1,
    q: "collection:(feature_films) AND mediatype:(movies) AND subject:(western OR westerns OR cowboy)" + KID_SAFE },
  { id: "documentaries", title: "Documentaries", level: 1,
    q: "collection:(feature_films OR prelinger OR documentaryandshortfilms) AND mediatype:(movies) AND subject:(documentary OR documentaries) AND NOT subject:(war OR propaganda OR crime)" + KID_SAFE },
  { id: "adventure", minMinutes: 40, title: "Adventure", level: 2,
    q: "collection:(feature_films) AND mediatype:(movies) AND subject:(adventure OR action) AND NOT subject:(horror)" },
  { id: "scifi", minMinutes: 40, title: "Sci-Fi", level: 2,
    q: "collection:(feature_films OR scifi_horror) AND mediatype:(movies) AND subject:(\"science fiction\" OR sci-fi OR scifi OR space) AND NOT subject:(horror)" },
  { id: "noir", minMinutes: 40, title: "Film Noir & Mystery", level: 3,
    q: "collection:(feature_films OR film_noir) AND mediatype:(movies) AND subject:(noir OR \"film noir\" OR mystery OR detective)" },
  { id: "horror", minMinutes: 40, title: "Horror Classics", level: 3,
    q: "collection:(feature_films) AND mediatype:(movies) AND subject:(horror)" },
];

// Series: cartoons and shorts that belong together get a show page with numbered episodes.
// Episodes are gathered from the rows listed, matched by title, oldest first.
const SERIES = [
  { id: "s-popeye", name: "Popeye the Sailor", level: 0, match: /\bpopeye\b/i, shelves: ["popeye", "cartoons", "animation"] },
  { id: "s-superman", name: "Superman (1941–1943)", level: 0, match: /\bsuperman\b/i, shelves: ["superman", "cartoons", "animation"] },
  { id: "s-betty", name: "Betty Boop", level: 0, match: /\bbetty\s*boop\b/i, shelves: ["cartoons", "animation"] },
  { id: "s-casper", name: "Casper the Friendly Ghost", level: 0, match: /\bcasper\b/i, shelves: ["cartoons", "animation", "holiday"] },
  { id: "s-felix", name: "Felix the Cat", level: 0, match: /\bfelix\b/i, shelves: ["cartoons", "animation", "silent"] },
  { id: "s-caminandes", name: "Caminandes", level: 0, match: /\bcaminandes\b/i, shelves: ["new-family"] },
  { id: "s-chaplin", name: "Charlie Chaplin Shorts", level: 0, match: /chaplin/i, shelves: ["chaplin", "silent", "comedy"] },
  { id: "s-keaton", name: "Buster Keaton Shorts", level: 0, match: /.*/, shelves: ["keaton"] },
  { id: "s-stooges", name: "The Three Stooges", level: 1, match: /\bstooges?\b/i, shelves: ["comedy", "golden-comedy"] },
];

// Live Channels: movies from these rows play back to back on a fixed schedule, like TV.
// Everyone who tunes in at the same time sees the same movie at the same spot.
const CHANNELS = [
  { id: "ch-cartoons", name: "Cartoon Classics", level: 0, shelves: ["cartoons", "popeye", "superman", "animation"], minutes: 7 },
  { id: "ch-family", name: "Family Movie Night", level: 0, shelves: ["family-night", "new-family"], minutes: 75 },
  { id: "ch-holiday", name: "Holiday Channel", level: 0, shelves: ["holiday"], minutes: 30 },
  { id: "ch-nature", name: "Nature & Animals", level: 0, shelves: ["nature", "documentaries"], minutes: 20 },
  { id: "ch-comedy", name: "Comedy Channel", level: 1, shelves: ["golden-comedy", "comedy", "chaplin", "keaton", "silent"], minutes: 60 },
  { id: "ch-westerns", name: "Western Channel", level: 1, shelves: ["westerns"], minutes: 60 },
  { id: "ch-scifi", name: "Sci-Fi Channel", level: 2, shelves: ["classic-scifi", "scifi", "new-teens"], minutes: 75 },
  { id: "ch-noir", name: "Noir Night", level: 3, shelves: ["noir-essentials", "noir"], minutes: 75 },
];

const GAMES = [
  { id: "movie-trivia", name: "Movie Trivia", sub: "Movie questions", icon: "?", bg: "linear-gradient(135deg,#6366f1,#1e1b4b)", type: "trivia", bank: "movies" },
  { id: "animal-quiz", name: "Animal Quiz", sub: "Animal questions", icon: "?", bg: "linear-gradient(135deg,#f59e0b,#78350f)", type: "trivia", bank: "animals" },
  { id: "world-quiz", name: "World Quiz", sub: "World and science questions", icon: "?", bg: "linear-gradient(135deg,#14b8a6,#134e4a)", type: "trivia", bank: "world" },
  { id: "space-dodge", name: "Space Dodge", sub: "Arcade · 1 player", icon: "S", bg: "linear-gradient(135deg,#0ea5e9,#0c4a6e)", type: "space" },
];

// Each question: q, answers (4), correct index.
const TRIVIA = {
  movies: [
    { q: "Which movie has a house lifted into the sky by balloons?", a: ["Toy Story", "Finding Nemo", "Up", "Cars"], c: 2 },
    { q: "What kind of fish is Nemo?", a: ["Goldfish", "Clownfish", "Shark", "Tuna"], c: 1 },
    { q: "In The Lion King, what is Simba's father's name?", a: ["Mufasa", "Scar", "Rafiki", "Timon"], c: 0 },
    { q: "What does Dorothy follow to get to the Emerald City?", a: ["A river", "The stars", "A yellow brick road", "A rainbow"], c: 2 },
    { q: "Which toy is a space ranger in Toy Story?", a: ["Woody", "Rex", "Buzz Lightyear", "Slinky"], c: 2 },
    { q: "In Frozen, what is the name of the snowman?", a: ["Sven", "Olaf", "Kristoff", "Hans"], c: 1 },
    { q: "What color is Shrek?", a: ["Blue", "Green", "Purple", "Orange"], c: 1 },
    { q: "Which movie features a rat who wants to be a chef in Paris?", a: ["Ratatouille", "Stuart Little", "Flushed Away", "Bolt"], c: 0 },
    { q: "Who lives in a pineapple under the sea?", a: ["Patrick Star", "Squidward", "SpongeBob", "Mr. Krabs"], c: 2 },
    { q: "In Cars, what is Lightning McQueen's race number?", a: ["7", "43", "95", "12"], c: 2 },
    { q: "What does E.T. want to do?", a: ["Go to school", "Phone home", "Eat pizza", "Fly a plane"], c: 1 },
    { q: "Which superhero is also called the Dark Knight?", a: ["Superman", "Spider-Man", "Batman", "Iron Man"], c: 2 },
    { q: "In Moana, what does Maui use to shape-shift?", a: ["A magic hook", "A seashell", "A crown", "A necklace"], c: 0 },
    { q: "Which film has toys named Woody and Jessie?", a: ["Toy Story 2", "Inside Out", "Coco", "Brave"], c: 0 },
    { q: "In Inside Out, which emotion is blue?", a: ["Joy", "Anger", "Sadness", "Fear"], c: 2 },
    { q: "What is the name of Harry Potter's school?", a: ["Hogwarts", "Narnia", "Neverland", "Atlantis"], c: 0 },
    { q: "Which classic silent film star played 'The Tramp'?", a: ["Buster Keaton", "Charlie Chaplin", "Harold Lloyd", "Laurel"], c: 1 },
    { q: "What kind of animal is Dumbo?", a: ["Mouse", "Elephant", "Bear", "Horse"], c: 1 },
    { q: "In Coco, what instrument does Miguel love to play?", a: ["Drums", "Piano", "Guitar", "Trumpet"], c: 2 },
    { q: "What are the little yellow helpers in Despicable Me called?", a: ["Minions", "Smurfs", "Gremlins", "Trolls"], c: 0 },
  ],
  animals: [
    { q: "What is the biggest animal on Earth?", a: ["Elephant", "Blue whale", "Giraffe", "Shark"], c: 1 },
    { q: "Which animal is known as the King of the Jungle?", a: ["Tiger", "Bear", "Lion", "Gorilla"], c: 2 },
    { q: "How many legs does a spider have?", a: ["6", "8", "10", "4"], c: 1 },
    { q: "What do pandas mostly eat?", a: ["Fish", "Bamboo", "Berries", "Grass"], c: 1 },
    { q: "Which bird can't fly but is a great swimmer?", a: ["Penguin", "Eagle", "Parrot", "Owl"], c: 0 },
    { q: "What is a baby kangaroo called?", a: ["Cub", "Kid", "Joey", "Pup"], c: 2 },
    { q: "Which animal has a very long neck?", a: ["Zebra", "Giraffe", "Hippo", "Camel"], c: 1 },
    { q: "What animal says 'moo'?", a: ["Sheep", "Pig", "Cow", "Goat"], c: 2 },
    { q: "Which animal is the fastest on land?", a: ["Cheetah", "Horse", "Lion", "Rabbit"], c: 0 },
    { q: "What do caterpillars turn into?", a: ["Bees", "Butterflies", "Spiders", "Ants"], c: 1 },
    { q: "Which animal has black and white stripes?", a: ["Leopard", "Zebra", "Panda", "Skunk"], c: 1 },
    { q: "How many arms does an octopus have?", a: ["6", "8", "10", "12"], c: 1 },
    { q: "Where do polar bears live?", a: ["The desert", "The Arctic", "The jungle", "Australia"], c: 1 },
    { q: "What is a group of fish called?", a: ["A school", "A pack", "A herd", "A flock"], c: 0 },
    { q: "Which animal is famous for being very slow?", a: ["Sloth", "Squirrel", "Monkey", "Fox"], c: 0 },
    { q: "Which of these is a reptile?", a: ["Frog", "Snake", "Dolphin", "Bat"], c: 1 },
  ],
  world: [
    { q: "What is the largest ocean?", a: ["Atlantic", "Indian", "Pacific", "Arctic"], c: 2 },
    { q: "How many continents are there?", a: ["5", "6", "7", "8"], c: 2 },
    { q: "Which planet is known as the Red Planet?", a: ["Venus", "Mars", "Jupiter", "Saturn"], c: 1 },
    { q: "What is the capital of France?", a: ["Rome", "Madrid", "Paris", "Berlin"], c: 2 },
    { q: "Which is the longest river in Africa?", a: ["Nile", "Congo", "Niger", "Zambezi"], c: 0 },
    { q: "What do bees make?", a: ["Milk", "Honey", "Silk", "Wax paper"], c: 1 },
    { q: "Which country is home to the kangaroo?", a: ["Brazil", "India", "Australia", "Canada"], c: 2 },
    { q: "What is frozen water called?", a: ["Steam", "Ice", "Fog", "Rain"], c: 1 },
    { q: "What is the closest star to Earth?", a: ["The Moon", "Polaris", "The Sun", "Sirius"], c: 2 },
    { q: "How many days are in a leap year?", a: ["364", "365", "366", "367"], c: 2 },
    { q: "Which is the tallest mountain in the world?", a: ["K2", "Mount Everest", "Kilimanjaro", "Denali"], c: 1 },
    { q: "What gas do plants take in from the air?", a: ["Oxygen", "Carbon dioxide", "Helium", "Nitrogen"], c: 1 },
    { q: "Which country built the Great Wall?", a: ["Japan", "China", "Egypt", "Mexico"], c: 1 },
    { q: "How many sides does a hexagon have?", a: ["5", "6", "7", "8"], c: 1 },
    { q: "What is the hottest planet in our solar system?", a: ["Mercury", "Venus", "Mars", "Jupiter"], c: 1 },
  ],
};
