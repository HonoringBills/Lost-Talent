import { onRequestPost as startVerification } from '../functions/api/verification/start.js'
import { onRequestPost as completeVerification } from '../functions/api/verification/complete.js'
import { onRequestPost as memberLeave } from '../functions/api/verification/member-leave.js'
import { onRequestGet as verificationPage } from '../functions/verify.js'
import {
  onAdminContent,
  onAdminLeagueTeam,
  onAdminMe,
  onAdminOrgTeam,
  onAdminSeason,
  onAdminTournament,
  onPublicState,
  onRegisterTeam,
} from '../functions/api/site.js'

function methodNotAllowed() {
  return new Response('Method Not Allowed', { status: 405 })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    try {
      if (url.pathname === '/api/public/state') {
        return request.method === 'GET'
          ? onPublicState({ request, env, ctx })
          : methodNotAllowed()
      }

      if (url.pathname === '/api/registration/team') {
        return onRegisterTeam({ request, env, ctx })
      }

      if (url.pathname === '/api/admin/me') {
        return request.method === 'GET'
          ? onAdminMe({ request, env, ctx })
          : methodNotAllowed()
      }

      if (url.pathname === '/api/admin/content') {
        return onAdminContent({ request, env, ctx })
      }

      if (url.pathname === '/api/admin/season') {
        return onAdminSeason({ request, env, ctx })
      }

      if (url.pathname === '/api/admin/org-team') {
        return onAdminOrgTeam({ request, env, ctx })
      }

      if (url.pathname === '/api/admin/league-team') {
        return onAdminLeagueTeam({ request, env, ctx })
      }

      if (url.pathname === '/api/admin/tournament') {
        return onAdminTournament({ request, env, ctx })
      }

      if (url.pathname === '/api/verification/start') {
        return request.method === 'POST'
          ? startVerification({ request, env, ctx })
          : methodNotAllowed()
      }

      if (url.pathname === '/api/verification/complete') {
        return request.method === 'POST'
          ? completeVerification({ request, env, ctx })
          : methodNotAllowed()
      }

      if (url.pathname === '/api/verification/member-leave') {
        return request.method === 'POST'
          ? memberLeave({ request, env, ctx })
          : methodNotAllowed()
      }

      if (url.pathname === '/verify') {
        return request.method === 'GET'
          ? verificationPage({ request, env, ctx })
          : methodNotAllowed()
      }

      return env.ASSETS.fetch(request)
    } catch (error) {
      console.error('Lost Talent Worker request failed', url.pathname, error)
      return new Response('Lost Talent service error', { status: 500 })
    }
  },
}
