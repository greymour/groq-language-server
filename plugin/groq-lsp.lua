if vim.g.loaded_groq_lsp then
  return
end
vim.g.loaded_groq_lsp = true

vim.api.nvim_create_user_command("GroqLspStart", function()
  require("groq-lsp").start()
end, { desc = "Start GROQ language server" })

vim.api.nvim_create_user_command("GroqLspStop", function()
  require("groq-lsp").stop()
end, { desc = "Stop GROQ language server" })

vim.api.nvim_create_user_command("GroqLspRestart", function()
  require("groq-lsp").restart()
end, { desc = "Restart GROQ language server" })
