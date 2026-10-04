import { Studio } from "lightning_sdk";

async function main() {
  const teamspace = process.env.LIGHTNING_TEAMSPACE;
  if (!teamspace) throw new Error("LIGHTNING_TEAMSPACE is required.");
  const [org, space] = teamspace.split("/", 2);
  if (!org || !space) throw new Error("LIGHTNING_TEAMSPACE must be <org>/<teamspace>.");

  const names = [
    "shortforge-lightning-physical-1791094737740-782d8bf4",
    "shortforge-lightning-physical-1791094738997-4c5bb705",
    "shortforge-lightning-physical-1791094770713-3d4b01ac",
    "shortforge-lightning-physical-1791094914328-10a718a9",
    "shortforge-lightning-physical-1791094944421-9cd3fe21",
    "shortforge-lightning-physical-1791095267471-0297af06",
    "shortforge-lightning-physical-1791095295813-d3419801",
    "shortforge-lightning-physical-1791095302327-d631d553",
    "shortforge-lightning-physical-1791095314064-caf0f48f",
    "shortforge-lightning-physical-1791095494950-764871cc",
    "shortforge-lightning-physical-1791095507001-554e6a03",
    "shortforge-lightning-physical-1791095524978-e401b8b7",
    "shortforge-lightning-physical-1791095526091-1cfd1b7d",
    "shortforge-live-lightning-probe-1791007995786",
  ];

  for (const name of names) {
    try {
      const studio = new Studio(name, space, { org, create_ok: false } as any);
      console.log(JSON.stringify({
        name,
        status: String((studio as any).status),
        machine: String((studio as any).machine ?? ""),
      }));
    } catch (error: any) {
      console.log(JSON.stringify({
        name,
        status: "ERROR",
        error: error?.message ?? String(error),
      }));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
