<script setup lang="ts">
import BasicUpload from './components/basicUpload.vue'
import BigfileUpload from './components/bigfileUpload.vue'
import FileList from './components/fileList.vue'



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
