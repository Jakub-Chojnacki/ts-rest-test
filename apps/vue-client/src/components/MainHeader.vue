<script setup lang="ts">
import { RouterLink } from "vue-router";
import Button from "./ui/button/Button.vue";
</script>

<template>
  <div class="px-4 gap-2 bg-black text-white h-header flex items-center">
    <RouterLink to="/">CodeFitness</RouterLink>
    <div
      class="flex gap-4 items-center ml-auto [&.router-link-active]:font-bold"
    >
      <RouterLink to="/login">
        <Button variant="secondary" type="button"> Logowanie</Button>
      </RouterLink>
      <RouterLink to="/signup">
        <Button variant="ghost" type="button">Rejestracja</Button>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped></style>
