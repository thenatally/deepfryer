import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		allowedHosts: ["test.tally.gay", "deepfry.tally.gay"],
	},
});
// i'm tally and i approve this message
// meoww mrrow mrrp mrrp mrrow rrrow
// meow meow meow meow meow meow meow meow