# Objective

Create the KS (for keep score) application for keeping score of matches, tournaments, leagues for my local billiards club. 

As an engineer, learn as much new technologies as possible, find out their pros&cons to be used in work projects.

# Use cases

Match is initialized between 2 players, is assigned a game and target score (some games target frames, others - points)

Match has different modes:
* basic -- players put the phone near table and use it to keep the score. in this case, the single page should present both scores and buttons to control above the fold
* stream -- when the match is transmitted to Youtube/TV, a separate page of scoreboard needs to be embedded via OBS. it should reflect the score and auto-update. players update score after their turn on a laptop or phone next to their table
* major tournament stream -- a secretary keeps track of the score. Bonus points -- show and switch a player's turn, and subsequently compute the stats (pot success, safety success, high break)


# Games and brief descriptions

* free pyramid: scores and frames can only go up, target is usually 8 points, unless handicap is involved (see below). a foul awards 1 point to the opponent, who picks the penalty ball to be removed from the table
* extended free pyramid: basically a single frame with tallied points. targets usually 30/40/80 points. with 1 or 2 balls left on the table, the potted balls are re-racked and the active player plays the next shot
* combined pyramid (agree, in English it does not make much sense, just a raw translation from Ukrainian): from score keeping standpoint equivalent to free pyramid. only title is different. it's just the game is played with a cue ball instead of every ball could be one
* combined pyramid (old rules): target is still by frames, but foul deducts a point from the offending player, who must replace 1 ball from their tally on the table. If no balls potted at that moment, the score goes negative: -1, -2, and potted balls are re-spotted before playing next shot
* Strila -- our local product, inspired by snooker to be played on the pyramid tables with a dedicated set of balls. Detailed rules description to follow
* двоборство -- зазвичай для підсумкових турнірів року. грають до двох перемог у сетах, 1 обовʼязковий сет комбінованої піраміди за старими правилами, 2 піраміди з продовженням. третій вирішальний сет за потреби обирає переможець жеребу. 
* multiplayer -- 3 to 5 players at the table. each frame they change order of play. when player B scores X points (1 to 10) after player A, B gets their score increased by X, B -- decreased by X. no targets, they play till they're tired and count the winnings towards the end.

The last 2 are the toughest to stream with the current tools, so we're looking to build the proper solution.


## Handicaps

In amateur leagues, some tournaments require more advanced players to provide handicap to less experienced. Example target scores: 9/7, 10/6, 40/30

With older scoreboards, we had to manually inflate the score, e.g. 2:0, at the start of each frame, however, TV viewer experience struggles.


# Engineering constraints and challenges

Except the app itself, my goals are to familiarize myself with the technologies I did not have a chance to touch yet.

* Deploy target: Cloudflare
* Package manager, test runner (when fitting): bun + workspaced sub-packages

I imagine to design the system in a modular way and be able to
* add/adjust game rules and configurations in a package with unit tests
* add/adjust scoreboard color themes in a package (maybe open for UI editing eventually)
* keep the UI or Tailwind color schemes for the core app in a package

However, I am curious to implement the same app in multiple versions: start from React Router 7, then try Tanstack Start and Astro+Hono, and see what else can be tested this way (Next.js is out for me). So packages should be re-used by the apps themselves

I am not sure if it's realistic to deploy experimental apps on subdomains, so they work with the same db instance and encoded game configs, just serving different bundles. If it is -- that would be amazing

Primary UI should be responsive, usable from iPhone 15 Pro and larger, iPad, laptop (constrain a max width at some point, so we don't care about too large screens)
Dark theme should follow the device, but can be also selected manually


# To be figured out

* how to architecture the packages in a way to have db separate
* which Cloudflare primitives to use? traffic would be pretty low, but scores must be corrent
* how to update the scoreboard on stream? websocket (had prior experience) vs server-side events (look more optimal, as the board does not emit anything, except possibly "ack")
* how to deal with internet outages (ideally, continue game locally, sync with server as soon as online)
* what db to use? how to store per-game details (can only think of a json, that each game class must provide handlers for)
* what UI library to choose for the primary app. Tailwind 4 is definitely here, did not work with it yet
* how to deal with auth? I imagine anonymous players can use their phone, while logged in players can set up tv scoreboards and link them to live matches (link is public, key part of pathname is ULID)
  I don't want to deal with emails, for starts, will probably give out up to 3 login/pass combos

# Iterations

The first deployed version should implement free and "old" combined pyramid games, with anonymous players using from the phone, and me able to set up the tv stream

V2: add Strila (details to follow)

V3: add multiplayer game
 








