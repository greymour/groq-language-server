local M = {}

M.defaults = {
  cmd = { "groq-language-server", "--stdio" },
  filetypes = { "groq", "typescript", "typescriptreact", "javascript", "javascriptreact" },
  root_patterns = { "sanity.config.ts", "sanity.config.js", "sanity.json", "package.json" },
  settings = {
    groq = {
      schema = {
        enabled = true,
      },
      extensions = {
        -- Enable @param {type} $name syntax for typing function parameters
        paramTypeAnnotations = false,
      },
    },
  },
  -- Schema path relative to workspace root (optional)
  schema_path = nil,
  auto_start = true,
}

M.options = vim.deepcopy(M.defaults)

function M.setup(opts)
  M.options = vim.tbl_deep_extend("force", M.defaults, opts or {})
end

function M.get()
  return M.options
end

return M
