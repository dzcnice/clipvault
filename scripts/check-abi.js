console.log(
  JSON.stringify({
    node: process.version,
    modules: process.versions.modules,
    napi: process.versions.napi,
    platform: process.platform,
    arch: process.arch
  })
)
