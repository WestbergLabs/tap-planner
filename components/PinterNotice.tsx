/**
 * Trademark and image attribution, shown in the footer of every page that
 * names a BrewPack or shows a pack shot.
 *
 * Deliberately one shared component rather than copied text: a notice that
 * drifts between pages is worse than no notice, and this is the wording the
 * project stands behind. If it needs to change, it should change everywhere at
 * once. The claims it makes must stay true — see the data and image policy in
 * docs/DEVELOPMENT.md.
 */
export default function PinterNotice() {
  return (
    <p>
      Tap Planner is an independent community project. It is not affiliated
      with, endorsed by, or sponsored by Pinter. &ldquo;Pinter&rdquo;, BrewPack
      names, and all official product images and artwork are the property of
      their respective owners, and are used here only to identify the pack you
      are brewing.
    </p>
  );
}
