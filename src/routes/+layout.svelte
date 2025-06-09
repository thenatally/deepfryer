<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="bg-yellow-50 dark:bg-zinc-900 transition-colors duration-300 min-h-screen">
	{@render children()}
</div>
