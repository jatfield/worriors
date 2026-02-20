# Vibe coding experiment

## Idea 

Wizard of Wor multiplayer FPS. I'd like to see if it would work, and how good the result would be. I have no experience with three.js, but I have some experience with multiplayer games, so it should be fun.
I'm imagining the game to be as close to the original as possible, or to be more precise, as close to my memories of the C64 version of the game.
Maybe we can have a top down view which looks just like the original game.

## Starting instructions:

"A browser based multiplayer FPS in javascript using three.js. First iteration has a randomly generated small labyrinth where two player in Apollo 11 styled space suits (one yellow the other blue) can move around and shoot each other with laser rifles."

### Initial thoughts:

- Wow, suprisingly complete and playable game.
- The agent took the laser a bit too literally, the players are shooting lines, that stay in place.
- The second player said that the message for him is stuck on Waiting for other player, even though the first player is already playing.
- It's a bit weird that everything is in the same file, and I also expected tests to be generated. Really human-like performance so far.

## Prompts:

1. "The weapons should shoot projectiles, like the blasters in Star Wars, bright red bolts, one at a time. The player can shoot again after the bolt collides with walls or enemies. There's a bug where the second player joining gets the waiting for opponent message, even though someone is on the server."
2. "I need a chat function and a top-down view of the labirynth, one on the bottom right, the other on the left. in the top-down view the players are represented from the side, and is updated as they move and shoot (the bolts are also visible here). I also need a life counter. each player has 3 lives shown not by a number but by the same representation as on the map"

### Second version:

- I added two instructions in the same commit, which was a gamble, but it turned out nice. 
- The walls on the radar are too thick, and the bolts don't always show up there.
- The game just stops after one player wins.
- The players on the radar look like they are swimming instead of walking. They should turn to the direction they are moving, simplified to 4 directions, and they should not be upside down.
- Really pleased with the game so far. I like how the shooting mechanic turned out. The chat function is just working perfectly.
- I'll try to introduce a monster in the next iteration. 
- Should not forget the Pac-Man style side teleporters, which are a big part of the original game.
- I miss the shooting sound with the doppler-like effect.
- A log would be nice. Can be included in the chat.

3. "The walls should be thinner than the corridors. The players on the radar should face the direction they are heading simplified to four directions, but should not turn upside down. There should be a log mentioning kills and players entering and winning in the chat. The game should restart when someone wins. The weapons should give a drawn out pew sound with some doppler-like modulation. I need a monster roaming the maze that kills players on touch and looks like a large blue wolf."

### Third version:

- Gambling on two instructions again.
- There are gaps in the walls, and on the radar the walls are still too thick
- The players on the radar are oriented in the same direction always, which is better, but not what I asked for.
- The wolf works, although it only kills on collision with the head, and it can't be shot.
- The shooting sound is high, but has a midi vibe that I like, and it's not like it can get close to the SID.

4. "There are gaps in the walls, and they are still too thick. Make them thinner, and the radar should represent the 3D layout correctly. The players should be able to shoot the wolf, and it should respawn after a delay."

- I can change the movement speeds by playing around with the constants
- The monsters should speed up as time passes, though
- I can also finetune the sound
- The hitbox size is also adjustable
- The gaps are fixed, but the corridors are too wide now
- The wolf spawns in the same spot, this should be random