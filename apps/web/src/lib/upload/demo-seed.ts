/**
 * Example scans, so the screen shows its design the moment it opens rather than
 * demanding a drag-and-drop before anything is visible.
 *
 * The files are the real archive images already in `public/`, renamed to the
 * conventions a scanner would produce — which means the pairing, validation and
 * size figures downstream are all genuine rather than mocked. The queue is
 * labelled as examples and clears in one click.
 */
const SEED = [
  // a clean pair, matched on _r / _v
  { as: "ansichtskarten_0042_r.jpg", from: "/archive/brunnen-mythen.jpg" },
  { as: "ansichtskarten_0042_v.jpg", from: "/archive/goldau-mythen.jpg" },
  // a pair using the long form, to show a second rule being applied
  { as: "bettschart_0308-recto.jpg", from: "/archive/einsiedeln-kloster.jpg" },
  { as: "bettschart_0308-verso.jpg", from: "/archive/einsiedeln-schule.jpg" },
  // two photographs whose backs have not been scanned — a normal, non-blocking
  // state, so the screen opens ready to run. Blocking cases (a lone verso, a
  // duplicate Signatur, a wrong file type) are reachable by dropping one in,
  // rather than greeting every visitor with a disabled primary action.
  { as: "ansichtskarten_0455.jpg", from: "/archive/brunnen-axenstein.jpg" },
  { as: "ansichtskarten_1204.jpg", from: "/archive/brunnen-quai.jpg" },
] as const;

export async function loadDemoScans(): Promise<File[]> {
  const files = await Promise.all(
    SEED.map(async (entry) => {
      const response = await fetch(entry.from);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new File([blob], entry.as, { type: blob.type || "image/jpeg" });
    }),
  );
  return files.filter((file): file is File => file !== null);
}
