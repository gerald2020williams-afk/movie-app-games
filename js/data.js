// Static data: age profiles, movie shelves, games, and trivia questions.

const PROFILES = [
  { id: "little", name: "Little Kids", ages: "Ages 0–6", level: 0, letter: "L", color: "#f0cf7a" },
  { id: "kids", name: "Kids", ages: "Ages 7–12", level: 1, letter: "K", color: "#d4a64a" },
  { id: "teens", name: "Teens", ages: "Ages 13–17", level: 2, letter: "T", color: "#c98f3a" },
  { id: "adults", name: "Adults", ages: "18 and up", level: 3, letter: "A", color: "#b07a2c" },
];

// Age labels shown on posters. A shelf is visible to a profile when shelf.level <= profile.level.
const AGE_LABELS = ["All ages", "Kids", "Teens", "Adults"];

// Movie shelves pulled live from the Internet Archive (free, legal, public domain films).
// `q` is an Internet Archive search query.
const SHELVES = [
  // Newer, modern-looking movies: free "open movies" made by the Blender Studio and others,
  // shared under Creative Commons so anyone can watch them for free.
  { id: "new-family", title: "New Free Movies", level: 0, featured: true, dedupe: true,
    q: "mediatype:(movies) AND title:(\"Big Buck Bunny\" OR \"Caminandes\" OR \"Wing It\" OR \"Coffee Run\" OR \"Agent 327\") AND (subject:(blender OR \"open movie\" OR animation) OR creator:(blender))" },
  { id: "new-teens", title: "New Free Movies for Teens", level: 2, featured: true, dedupe: true,
    q: "mediatype:(movies) AND title:(\"Sintel\" OR \"Tears of Steel\" OR \"Cosmos Laundromat\" OR \"Sprite Fright\" OR \"Elephants Dream\") AND (subject:(blender OR \"open movie\" OR animation OR \"science fiction\") OR creator:(blender))" },
  { id: "cartoons", title: "Classic Cartoons", level: 0,
    q: "collection:(classic_cartoons) AND mediatype:(movies)" },
  { id: "animation", title: "More Animation", level: 0,
    q: "collection:(animationandcartoons) AND mediatype:(movies) AND NOT subject:(horror OR war OR propaganda)" },
  { id: "comedy", title: "Comedy Classics", level: 1,
    q: "collection:(feature_films) AND mediatype:(movies) AND subject:(comedy) AND NOT subject:(horror OR crime)" },
  { id: "silent", title: "Silent Film Fun", level: 1,
    q: "collection:(silent_films) AND mediatype:(movies) AND subject:(comedy)" },
  { id: "adventure", title: "Adventure & Sci-Fi", level: 2,
    q: "collection:(feature_films) AND mediatype:(movies) AND subject:(adventure OR \"science fiction\" OR sci-fi OR western)" },
  { id: "noir", title: "Film Noir & Mystery", level: 3,
    q: "collection:(film_noir) AND mediatype:(movies)" },
  { id: "horror", title: "Horror Classics", level: 3,
    q: "collection:(feature_films) AND mediatype:(movies) AND subject:(horror)" },
];

const GAMES = [
  { id: "movie-trivia", name: "Movie Trivia", sub: "Questions · all ages", icon: "?", bg: "linear-gradient(135deg,#6366f1,#1e1b4b)", type: "trivia", bank: "movies" },
  { id: "animal-quiz", name: "Animal Quiz", sub: "Questions · kids", icon: "?", bg: "linear-gradient(135deg,#f59e0b,#78350f)", type: "trivia", bank: "animals" },
  { id: "world-quiz", name: "World Quiz", sub: "Questions · 7 and up", icon: "?", bg: "linear-gradient(135deg,#14b8a6,#134e4a)", type: "trivia", bank: "world" },
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
