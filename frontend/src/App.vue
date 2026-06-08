<script setup lang="ts">
import BasicUpload from './components/basicUpload.vue'
import BigfileUpload from './components/bigfileUpload.vue'
import FileList from './components/fileList.vue'

if (window.Worker) {
  // …
  console.log(window.Worker.name)
}

</script>

<template>
  <div>
    <h1>大文件上传</h1>
    <FileList></FileList>
    <hr>
    <BasicUpload></BasicUpload>
    <hr>
    <BigfileUpload></BigfileUpload>
  </div>
</template>
