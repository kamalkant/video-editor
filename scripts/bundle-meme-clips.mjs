import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "public", "library", "memes");
mkdirSync(OUT_DIR, { recursive: true });

const CLIPS = [
  { id: "babu-khopdi-tod", query: "khopdi tod saale ka meme green screen or short", duration: 3.5 },
  { id: "raju-paisa-hi-paisa", query: "paisa hi paisa hoga meme green screen or clip", duration: 3.0 },
  { id: "raju-scheme", query: "zor zor se bolke scheme bata de meme clip", duration: 3.8 },
  { id: "babu-dhoti-khol-raha-hai", query: "arey ye to dhoti khol raha hai meme clip", duration: 3.2 },
  { id: "babu-utha-le-re-deva", query: "utha le re deva babu bhaiya meme", duration: 4.0 },
  { id: "welcome-control-uday", query: "control uday control meme clip", duration: 3.2 },
  { id: "welcome-miracle", query: "miracle miracle welcome meme clip", duration: 3.5 },
  { id: "welcome-majnu-manokamna", query: "meri aisi koi manokamna nahi hai meme", duration: 3.5 },
  { id: "wasseypur-faizal-badla", query: "baap ka dada ka sabka badla lega re tera faizal meme", duration: 4.2 },
  { id: "gangs-tumse-na-ho-payega", query: "beta tumse na ho payega meme clip", duration: 3.2 },
  { id: "mirzapur-ye-bhi-theek-hai", query: "ye bhi theek hai mirzapur meme clip", duration: 2.8 },
  { id: "mirzapur-bhaukaal", query: "bhaukaal mirzapur munna bhaiya meme", duration: 3.5 },
  { id: "mirzapur-bawaal-cheez", query: "bawaal cheez hai be mirzapur meme", duration: 3.2 },
  { id: "panchayat-gajab-beizzati", query: "gajab beizzati hai yaar panchayat meme", duration: 3.4 },
  { id: "panchayat-dekh-raha-hai-vinod", query: "dekh raha hai na vinod panchayat meme", duration: 4.0 },
  { id: "3idiots-kehna-kya-chahte-ho", query: "arey kehna kya chahte ho 3 idiots meme", duration: 3.5 },
  { id: "cid-daya-darwaza-tod", query: "daya darwaza tod do cid meme", duration: 3.0 },
  { id: "cid-kuch-to-gadbad-hai", query: "kuch to gadbad hai daya cid meme", duration: 3.5 },
  { id: "savage-kya-gunda-banega-re-tu", query: "kya gunda banega re tu babu bhaiya meme", duration: 3.2 },
  { id: "golmaal-aaye-haaye", query: "aaye haaye kya baat hai golmaal meme", duration: 3.2 },
  { id: "jethalal-chup-ho-ja-satvi-fail", query: "chup ho ja saatvi fail jethalal meme", duration: 3.2 },
  { id: "taarak-goli-beta-masti-nahi", query: "goli beta masti nahi meme", duration: 3.0 },
  { id: "crime-patrol-savdhaan-rahein", query: "savdhaan rahein satark rahein anoop soni meme", duration: 3.5 },
  { id: "steve-carell-no-god-please-no", query: "no god please no the office michael scott meme", duration: 3.8 },
  { id: "leonardo-laughing-cheers", query: "leonardo dicaprio laughing django meme clip", duration: 3.2 },
  { id: "gigachad-can-you-feel-my-heart", query: "gigachad phonk meme clip short", duration: 4.0 },
  { id: "confused-travolta", query: "confused travolta green screen meme", duration: 3.5 },
  { id: "pedro-pascal-laughing-crying", query: "pedro pascal laughing then crying meme", duration: 3.5 },
];

async function processClip(item) {
  const mp4Out = join(OUT_DIR, `${item.id}.mp4`);
  const jpgOut = join(OUT_DIR, `${item.id}.jpg`);

  if (existsSync(mp4Out) && existsSync(jpgOut)) {
    console.log(`[SKIP] Already exists: ${item.id}`);
    return;
  }

  console.log(`[DOWNLOADING] ${item.id} (query: "${item.query}")...`);
  const tempRaw = `/tmp/raw_${item.id}.mp4`;

  try {
    execSync(
      `yt-dlp "ytsearch1:${item.query}" -f "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" --force-overwrites -o "${tempRaw}"`,
      { stdio: "ignore", timeout: 30000 }
    );

    // Trim and normalize video & audio
    execSync(
      `ffmpeg -i "${tempRaw}" -t ${item.duration} -vf "scale='min(640,iw)':-2" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 -shortest -movflags +faststart -y "${mp4Out}"`,
      { stdio: "ignore", timeout: 20000 }
    );

    // Extract sharp poster thumbnail
    execSync(
      `ffmpeg -ss 00:00:01 -i "${mp4Out}" -frames:v 1 -q:v 2 -y "${jpgOut}"`,
      { stdio: "ignore", timeout: 10000 }
    );

    console.log(`[DONE] ${item.id} -> ${mp4Out}`);
  } catch (err) {
    console.error(`[ERROR] Failed to fetch ${item.id}:`, err.message);
  }
}

async function main() {
  console.log(`Processing ${CLIPS.length} real meme clips...`);
  for (const item of CLIPS) {
    await processClip(item);
  }
  console.log("All clips processed!");
}

main();
