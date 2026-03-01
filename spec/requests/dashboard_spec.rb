# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Dashboard", type: :request do
  describe "GET /dashboard" do
    it "redirects guests to sign in" do
      get dashboard_url

      expect(response).to redirect_to(sign_in_url)
    end

    it "returns success for signed-in users and includes their drawings" do
      user = create(:user)
      Draft.create!(
        user:,
        payload: {
          "nodes" => [
            {"id" => "node-1", "kind" => "text", "label" => "Flow One", "x" => 1, "y" => 1, "w" => 8, "h" => 1, "z" => 1}
          ]
        },
        version: 2
      )
      Draft.create!(
        user:,
        payload: {"nodes" => []},
        version: 1
      )

      sign_in_as(user)
      get dashboard_url

      expect(response).to have_http_status(:success)
      expect(response.body).to include("Flow One")
      expect(response.body).to include("Untitled drawing")
    end
  end
end
