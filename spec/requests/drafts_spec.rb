# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Draft", type: :request do
  describe "GET /draft" do
    it "returns empty payload for a new guest" do
      get draft_url, as: :json

      expect(response).to have_http_status(:success)
      expect(JSON.parse(response.body)).to eq({"nodes" => [], "version" => 0})
    end

    it "returns persisted payload for the same guest token" do
      nodes = [{"id" => "node-1", "kind" => "text", "label" => "T", "x" => 1, "y" => 1, "w" => 6, "h" => 1, "z" => 1}]

      put draft_url, params: {nodes:, version: 0}, as: :json
      expect(response).to have_http_status(:success)

      get draft_url, as: :json

      expect(response).to have_http_status(:success)
      expect(JSON.parse(response.body)).to eq({"nodes" => nodes, "version" => 1})
    end

    it "returns guest draft immediately after sign-in before explicit claim" do
      nodes = [{"id" => "node-1", "kind" => "text", "label" => "T", "x" => 1, "y" => 1, "w" => 6, "h" => 1, "z" => 1}]

      put draft_url, params: {nodes:, version: 0}, as: :json
      expect(response).to have_http_status(:success)

      user = create(:user)
      post sign_in_url, params: {email: user.email, password: "Secret1*3*5*"}
      expect(response).to redirect_to(dashboard_url)

      get draft_url, as: :json

      expect(response).to have_http_status(:success)
      expect(JSON.parse(response.body)).to eq({"nodes" => nodes, "version" => 1})
    end

    it "returns shared draft by share token for guests" do
      draft = Draft.create!(
        payload: {"nodes" => [{"id" => "node-1", "kind" => "text", "label" => "Shared", "x" => 1, "y" => 1, "w" => 6, "h" => 1, "z" => 1}]},
        version: 3,
        guest_token: SecureRandom.hex(24),
        share_token: "share-token-123",
        share_permission: "view"
      )

      get draft_url, params: {share_token: draft.share_token}, as: :json

      expect(response).to have_http_status(:success)
      body = JSON.parse(response.body)
      expect(body["version"]).to eq(3)
      expect(body["nodes"]).to eq(draft.payload["nodes"])
      expect(body["permission"]).to eq("view")
    end
  end

  describe "PUT /draft" do
    let(:nodes) do
      [
        {
          id: "node-1",
          kind: "card",
          label: "Card",
          x: 1,
          y: 2,
          w: 20,
          h: 8,
          z: 1
        }
      ]
    end

    it "creates a draft for a new guest and sets signed token cookie" do
      put draft_url, params: {nodes:, version: 0}, as: :json

      expect(response).to have_http_status(:success)
      body = JSON.parse(response.body)
      expect(body["version"]).to eq(1)
      expect(body["nodes"]).to eq(JSON.parse(nodes.to_json))
      set_cookie_header = Array(response.headers["Set-Cookie"]).join("\n")
      expect(set_cookie_header).to include("guest_token=")
      expect(Draft.count).to eq(1)
    end

    it "returns conflict when expected version is stale" do
      put draft_url, params: {nodes:, version: 0}, as: :json
      expect(response).to have_http_status(:success)

      put draft_url, params: {nodes:, version: 1}, as: :json
      expect(response).to have_http_status(:success)

      put draft_url, params: {nodes:, version: 1}, as: :json

      expect(response).to have_http_status(:conflict)
      body = JSON.parse(response.body)
      expect(body["error"]).to eq("version_conflict")
      expect(body["version"]).to eq(2)
    end

    it "updates shared draft when share permission is edit" do
      draft = Draft.create!(
        payload: {"nodes" => []},
        version: 1,
        guest_token: SecureRandom.hex(24),
        share_token: "share-token-edit",
        share_permission: "edit"
      )

      put draft_url, params: {share_token: draft.share_token, nodes:, version: 1}, as: :json

      expect(response).to have_http_status(:success)
      body = JSON.parse(response.body)
      expect(body["version"]).to eq(2)
      expect(body["nodes"]).to eq(JSON.parse(nodes.to_json))
    end

    it "returns forbidden when shared draft permission is view" do
      draft = Draft.create!(
        payload: {"nodes" => []},
        version: 1,
        guest_token: SecureRandom.hex(24),
        share_token: "share-token-view",
        share_permission: "view"
      )

      put draft_url, params: {share_token: draft.share_token, nodes:, version: 1}, as: :json

      expect(response).to have_http_status(:forbidden)
      body = JSON.parse(response.body)
      expect(body["error"]).to eq("forbidden")
    end
  end

  describe "POST /draft/claim" do
    let(:nodes) do
      [
        {
          id: "node-1",
          kind: "card",
          label: "Card",
          x: 1,
          y: 2,
          w: 20,
          h: 8,
          z: 1
        }
      ]
    end

    it "claims guest draft to authenticated user" do
      put draft_url, params: {nodes:, version: 0}, as: :json
      expect(response).to have_http_status(:success)

      user = create(:user)
      post sign_in_url, params: {email: user.email, password: "Secret1*3*5*"}
      expect(response).to redirect_to(dashboard_url)

      post claim_draft_url, as: :json

      expect(response).to have_http_status(:success)
      body = JSON.parse(response.body)
      expect(body["status"]).to eq("claimed")
      expect(Draft.count).to eq(1)
      draft = Draft.first
      expect(draft.user_id).to eq(user.id)
      expect(draft.guest_token).to be_nil
    end
  end

  describe "POST /draft/share" do
    it "creates share link for signed-in user's draft" do
      user = create(:user)
      post sign_in_url, params: {email: user.email, password: "Secret1*3*5*"}
      expect(response).to redirect_to(dashboard_url)

      put draft_url, params: {nodes: [], version: 0}, as: :json
      expect(response).to have_http_status(:success)

      post share_draft_url, as: :json

      expect(response).to have_http_status(:success)
      body = JSON.parse(response.body)
      expect(body["status"]).to eq("ready")
      expect(body["share_url"]).to be_present
      expect(body["permission"]).to eq("view")
    end
  end

  describe "PATCH /draft/share_settings" do
    it "updates collaboration permission for signed-in user's share link" do
      user = create(:user)
      post sign_in_url, params: {email: user.email, password: "Secret1*3*5*"}
      expect(response).to redirect_to(dashboard_url)

      put draft_url, params: {nodes: [], version: 0}, as: :json
      expect(response).to have_http_status(:success)

      post share_draft_url, as: :json
      expect(response).to have_http_status(:success)

      patch share_settings_draft_url, params: {permission: "edit"}, as: :json

      expect(response).to have_http_status(:success)
      body = JSON.parse(response.body)
      expect(body["status"]).to eq("updated")
      expect(body["permission"]).to eq("edit")
    end
  end
end
