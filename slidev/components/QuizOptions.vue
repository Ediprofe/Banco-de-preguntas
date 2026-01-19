<script setup>
import { computed } from 'vue'

/**
 * QuizOptions - Componente Vue para opciones de respuesta
 * Diseño: Modo Claro (Clean/Paper Style)
 * 
 * Props:
 * - options: Array de objetos con { letter, text } o Array de strings
 * - cols: Número de columnas (1, 2, 3, 4) - default: auto basado en longitud
 * - size: Tamaño del texto 'sm', 'base', 'lg', 'xl' (default: 'lg')
 */
const props = defineProps({
  options: {
    type: Array,
    required: true
  },
  cols: {
    type: [String, Number],
    default: 'auto'
  },
  size: {
    type: String,
    default: 'lg'
  }
})

const letters = ['A', 'B', 'C', 'D', 'E', 'F']

const normalizedOptions = computed(() => {
  return props.options.map((opt, i) => {
    if (typeof opt === 'string') {
      return { letter: letters[i], text: opt }
    }
    return { letter: opt.letter || letters[i], text: opt.text || opt }
  })
})

const gridCols = computed(() => {
  if (props.cols !== 'auto') {
    return parseInt(props.cols)
  }
  const maxLen = Math.max(...normalizedOptions.value.map(o => o.text.length))
  return maxLen < 50 ? 2 : 1
})

const textSizeClass = computed(() => {
  const sizes = {
    'sm': 'text-base',
    'base': 'text-lg', 
    'lg': 'text-xl',
    'xl': 'text-2xl'
  }
  return sizes[props.size] || sizes.lg
})
</script>

<template>
  <div 
    class="quiz-options grid gap-4 mt-6"
    :class="{
      'grid-cols-1': gridCols === 1,
      'grid-cols-2': gridCols === 2,
      'grid-cols-3': gridCols === 3,
      'grid-cols-4': gridCols === 4
    }"
  >
    <div
      v-for="option in normalizedOptions"
      :key="option.letter"
      class="option-card p-4 rounded-xl border-2 transition-all duration-200 
             cursor-pointer group flex items-center gap-4
             bg-white border-slate-200 shadow-sm
             hover:border-blue-500 hover:shadow-md hover:bg-blue-50/50"
    >
      <span 
        class="letter-badge flex-shrink-0 w-11 h-11 rounded-full 
               flex items-center justify-center font-bold text-lg
               bg-slate-100 text-slate-600 border border-slate-300
               group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600
               group-hover:scale-110 transition-all duration-300"
      >
        {{ option.letter }}
      </span>
      
      <span 
        class="option-text font-medium leading-relaxed text-slate-700
               group-hover:text-blue-900 transition-colors duration-200"
        :class="textSizeClass"
      >
        {{ option.text }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.quiz-options {
  max-width: 100%;
}
</style>
