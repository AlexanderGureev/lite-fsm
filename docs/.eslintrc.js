module.exports = {
  overrides: [
    {
      files: ["**/_meta.js"],
      rules: {
        "no-undef": "off",
        "no-restricted-syntax": "off",
      },
      parserOptions: {
        sourceType: "module",
      },
    },
  ],
};
