// Fallback gallery data used when Supabase isn't configured yet (e.g. local dev
// before you've created the project). Once Supabase is connected, the live
// `art_pieces` table takes over and this is ignored.
export const sampleArt = [
  {
    id: "sample-1",
    title: "Tiny Cloud #4",
    description: "Hand-cut paper cloud on a clothespin. One of a kind.",
    image_url:
      "https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=600&q=70",
    suggested_amount: 5,
    payment_link: "https://square.link/u/REPLACE-ME",
  },
  {
    id: "sample-2",
    title: "Pocket Monster",
    description: "Clay creature, about the size of a walnut. Friendly, mostly.",
    image_url:
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&q=70",
    suggested_amount: 8,
    payment_link: "https://square.link/u/REPLACE-ME",
  },
  {
    id: "sample-3",
    title: "Street Bloom",
    description: "Pressed wildflower sealed in resin. Picked from a sidewalk crack.",
    image_url:
      "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=600&q=70",
    suggested_amount: 6,
    payment_link: "https://square.link/u/REPLACE-ME",
  },
];
