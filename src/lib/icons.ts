// Keyword → Lucide icon name mapping.
// suggestIcon(title) returns a Lucide icon name or null (fall through to derived type icon).

const KEYWORD_MAP: [string[], string][] = [
  [["dentist", "dental", "teeth", "tooth", "orthodontist"], "Smile"],
  [["doctor", "physician", "hospital", "clinic", "health", "medical", "checkup", "gp"], "Stethoscope"],
  [["gym", "workout", "exercise", "run", "running", "walk", "walking", "cycle", "cycling", "swim", "yoga", "pilates", "fitness"], "Dumbbell"],
  [["garden", "gardening", "plant", "mow", "lawn", "hedge", "shed", "greenhouse", "compost"], "Shovel"],
  [["build", "diy", "repair", "fix", "install", "construct", "renovation", "renovate", "plumber", "electrician", "carpenter"], "Hammer"],
  [["house", "home", "apartment", "flat", "rent", "mortgage", "property"], "House"],
  [["car", "vehicle", "drive", "driving", "garage", "mechanic", "tyre", "tire", "mot", "service"], "Car"],
  [["shop", "shopping", "buy", "purchase", "order", "groceries", "supermarket", "market"], "ShoppingCart"],
  [["bank", "savings", "finance", "budget", "money", "salary", "account", "invest", "pension", "transfer", "payment"], "PiggyBank"],
  [["travel", "trip", "holiday", "vacation", "flight", "hotel", "booking", "airport", "passport", "visa"], "Plane"],
  [["meeting", "standup", "call", "conference", "interview", "presentation", "demo", "sync"], "Users"],
  [["email", "inbox", "message", "send", "reply", "newsletter"], "Mail"],
  [["phone", "ring", "voicemail", "mobile", "sms", "text"], "Phone"],
  [["book", "read", "reading", "course", "learn", "study", "research", "article", "blog"], "BookOpen"],
  [["code", "coding", "programming", "software", "deploy", "debug", "review", "pr", "github"], "Code2"],
  [["design", "figma", "sketch", "wireframe", "mockup", "prototype", "ui", "ux"], "Palette"],
  [["write", "writing", "draft", "document", "report", "proposal", "blog", "post"], "FileText"],
  [["food", "cook", "cooking", "meal", "recipe", "restaurant", "dinner", "lunch", "breakfast", "bake", "baking"], "UtensilsCrossed"],
  [["clean", "cleaning", "tidy", "organise", "organize", "declutter", "laundry", "wash", "vacuum"], "Sparkles"],
  [["birthday", "anniversary", "celebration", "party", "wedding", "event"], "PartyPopper"],
  [["gift", "present", "surprise"], "Gift"],
  [["kid", "kids", "child", "children", "school", "pickup", "dropoff", "homework", "parent", "family"], "Baby"],
  [["pet", "dog", "cat", "vet", "walk the dog"], "PawPrint"],
  [["music", "practice", "instrument", "guitar", "piano", "sing", "concert", "gig"], "Music"],
  [["photo", "photography", "camera", "film", "video", "record", "edit"], "Camera"],
  [["tax", "taxes", "accountant", "vat", "invoice", "receipt", "expense"], "Receipt"],
  [["legal", "lawyer", "contract", "sign", "document", "gdpr", "compliance"], "Scale"],
  [["move", "moving", "relocate", "pack", "packing", "removal"], "PackageOpen"],
  [["charity", "volunteer", "donate", "donation", "fundraise"], "Heart"],
  [["solar", "energy", "electricity", "bill", "utility", "water", "gas", "broadband"], "Zap"],
];

export function suggestIcon(title: string): string | null {
  const lower = title.toLowerCase();
  for (const [keywords, icon] of KEYWORD_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) return icon;
  }
  return null;
}
