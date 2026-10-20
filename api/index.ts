import express from "express"
import type { Request, Response, NextFunction } from "express"
import app from "../server/api.ts"

const vercelApi = express()

vercelApi.use(
  (request: Request, _response: Response, next: NextFunction) => {
    const routedPath = request.query.__vercelPath
    if (typeof routedPath === "string" && routedPath.startsWith("/api/")) {
      const rewrittenUrl = new URL(request.url, "http://vercel.internal")
      rewrittenUrl.searchParams.delete("__vercelPath")
      request.url = `${routedPath}${rewrittenUrl.search}`
    }
    next()
  },
  app,
)

export default vercelApi
