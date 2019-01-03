## river-scaffold

Typescript-React's scaffold, the scaffold configures are learning from poi and vue-cli.

### development environment

Node.js >= 8.9.0

### scripts

```
serve
'--mode': `specify env mode (default: development)`,
'--host': `specify host`,
'--port': `specify port`,
'--https': `use https`,

build
'--mode': `specify env mode (default: production)`,
'--dest': `specify output directory`,
'--modern': `build app targeting modern browsers with auto fallback`
```

### css

you can set css-modules in scaffold, settings in `river.config.js`

```javascript
css: {
  modules: true;
}
```

if you set it, you can import `*.module.(css|less|scss|styl)$` as cssModules in your project.
you also can add css loaders options in css object.

### webpack

you can add webpack configures in the `river.config.js`.
