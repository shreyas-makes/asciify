# frozen_string_literal: true

require "rails_helper"

RSpec.describe "SharedDrafts", type: :request do
  describe "GET /shared/:token" do
    it "returns success for an existing shared token" do
      draft = Draft.create!(
        payload: {"nodes" => []},
        version: 1,
        guest_token: SecureRandom.hex(24),
        share_token: "shared-token-abc",
        share_permission: "view"
      )

      get shared_draft_url(token: draft.share_token)

      expect(response).to have_http_status(:success)
    end

    it "returns not found for unknown token" do
      get shared_draft_url(token: "missing-token")

      expect(response).to have_http_status(:not_found)
    end
  end
end
