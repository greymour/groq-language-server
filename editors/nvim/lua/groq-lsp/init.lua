local M = {}

local config = require("groq-lsp.config")

local function get_root_dir(bufnr)
  local patterns = config.get().root_patterns
  local fname = vim.api.nvim_buf_get_name(bufnr)
  local root = vim.fs.dirname(vim.fs.find(patterns, { upward = true, path = vim.fs.dirname(fname) })[1])
  return root or vim.fn.getcwd()
end

local function start_client(bufnr)
  local opts = config.get()

  if vim.fn.executable(opts.cmd[1]) ~= 1 then
    return nil
  end

  local root_dir = get_root_dir(bufnr)

  -- Resolve schema path relative to root_dir
  local resolved_schema_path = nil
  if opts.schema_path and root_dir then
    resolved_schema_path = root_dir .. "/" .. opts.schema_path
  end

  local client_id = vim.lsp.start({
    name = "groq_ls",
    cmd = opts.cmd,
    root_dir = root_dir,
    settings = opts.settings,
    init_options = {
      schemaPath = resolved_schema_path,
      extensions = opts.settings.groq and opts.settings.groq.extensions or nil,
    },
  })

  return client_id
end

function M.setup(opts)
  config.setup(opts)

  local options = config.get()

  if options.auto_start then
    vim.api.nvim_create_autocmd("FileType", {
      pattern = options.filetypes,
      callback = function(args)
        start_client(args.buf)
      end,
      group = vim.api.nvim_create_augroup("groq_lsp", { clear = true }),
    })
  end
end

function M.start()
  local bufnr = vim.api.nvim_get_current_buf()
  return start_client(bufnr)
end

function M.stop()
  local clients = vim.lsp.get_clients({ name = "groq_ls" })
  for _, client in ipairs(clients) do
    client.stop()
  end
end

function M.restart()
  M.stop()
  vim.defer_fn(function()
    M.start()
  end, 100)
end

return M
