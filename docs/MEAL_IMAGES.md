# Bundled meal serving inspiration

November 8, 2026. Six original category images were created once with the built-in **imagegen** tool using the `imagegen` skill. No Gemini image API, user Gemini key, external photo-search API, paid-resource setup or CLI fallback was used. The browser and server make no image-generation requests at runtime: these are ordinary bundled local assets. Regenerating or swapping a meal changes the deterministic category choice and consumes **zero image-generation API calls**.

## Assets and display behavior

Final assets are `public/meal-images/pasta.webp`, `curry.webp`, `bowl.webp`, `stew.webp`, `tacos.webp` and `breakfast.webp`. Each is 960 × 640 WebP, converted with the already-installed Sharp library from the original 1536 × 1024 PNG. Original generated PNGs remain under Codex's generated-images directory; the app only uses the project assets. No external image host, attribution service or remote search result is required.

`src/lib/meal-images.ts` chooses a category from the dish name, then structured ingredient hints. Soup/stew/curry/taco labels take priority over side ingredients; an unfamiliar meal uses a vegetable grain bowl as general inspiration. This is a category library, **not** a photograph generated for every particular recipe. The visible label is **AI-generated serving inspiration**. Alt text names the pictured category and explicitly says it is not the exact recipe.

All images were prompted and visually inspected as plant-based food to avoid displaying obvious meat on vegetarian or vegan meals. They can still show ingredients that differ from the actual recipe, and do not establish allergen safety, brand suitability, finished appearance, nutrition, inventory or grocery availability. The written recipe and ingredient list remain authoritative.

## Final prompt set

Each image was generated in a separate built-in call, with transparency disabled. Shared direction: `Use case: photorealistic-natural. Asset: reusable food photograph for a recipe-card serving-inspiration library. Create a highly appetizing editorial food photo. Warm light neutral tabletop. Close three-quarter overhead angle, natural window lighting, realistic food texture, restrained styling. Landscape 3:2 composition, full bowl or plate centered with safe margins for a wide card crop. No people, labels, logos, text, borders, collage, cartoons or illustrations.`

Subject and food constraints for each prompt:

- **Pasta:** rustic vegetarian penne pasta with glossy tomato sauce, roasted cherry tomatoes and fresh basil, in an ivory ceramic bowl. No cheese, meat, fish or eggs; entirely plant based.
- **Curry:** chickpea, spinach and tomato curry in rich golden-orange coconut sauce, with a little steamed rice in the same ivory bowl. Entirely plant based; no meat, fish, egg, dairy, nuts or unrelated garnish. Gentle steam.
- **Bowl:** fluffy brown rice, pan-seared tofu cubes, tender broccoli, roasted carrots, red bell pepper and peas, in an ivory bowl. Entirely plant based; no meat, fish, dairy or eggs. Glossy vegetables and crisp textures.
- **Stew:** three-bean vegetable chili with red kidney beans, black beans, white beans, diced tomatoes, peppers and a small cilantro garnish, in an ivory bowl. Thick warming red stew; no meat, fish, egg, cheese or sour cream. Gentle steam.
- **Tacos:** three soft corn tacos with black beans, roasted sweet potato, diced tomato, shredded lettuce and avocado, with a lime wedge, on an ivory plate. Entirely plant based; no meat, fish, egg, cheese or cream. Toasted tortilla texture.
- **Breakfast:** warm creamy oatmeal made with oat milk, topped with blueberries, strawberries and banana, in an ivory bowl. Entirely plant based; no dairy, egg, meat, nuts, honey or seeds. Natural morning window light.

All six generated outputs were inspected for subject, photorealistic style, visible ingredients and absence of text/branding. Meaningful tests cover category choice, ingredient-based fallback, local asset existence and WebP format/size, stable selection, and truthful labels.
